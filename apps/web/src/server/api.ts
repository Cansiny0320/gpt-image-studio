import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { models } from '../lib/models';
import { createArchive, type Archive } from './archive';
import { assertOrigin } from './security';
import { parseInput } from './input';
import { imageEvents, openImageRequest, type ServerImageEvent } from './openai';
import { imageAbortReason, ImageResponseError, imageTimeoutMessage, PublicError, safeError } from './errors';
import { imageTransport, type TransportEnvironment } from './transport';
import { upstreamRequestId } from './upstream-error';

function generationPauseReason(env: Env) {
  return env.GENERATION_PAUSED === 'true' ? '图片生成额度已用完，服务暂时关闭。' : null;
}

export const router = {
  config: os.$context<{ env: Env }>().handler(({ context }) => ({
    models,
    previewFormats: context.env.ENABLE_PREVIEW_FORMATS === 'true',
    configured: Boolean(context.env.OPENAI_API_KEY && context.env.APP_ORIGIN),
    generationPauseReason: generationPauseReason(context.env),
  })),
};
const rpc = new RPCHandler(router);
export type AppRouter = typeof router;

function* encodeImage(event: ServerImageEvent, encoder: TextEncoder): Generator<Uint8Array> {
  const { image, ...metadata } = event;
  // Only Base64 characters go inside the JSON string; binary blocks align on three-byte boundaries.
  yield encoder.encode(JSON.stringify(metadata).slice(0, -1) + ',"b64":"');
  for (const chunk of image.chunks) yield encoder.encode(chunk.toString('base64'));
  yield encoder.encode('"}\n');
}

export async function handleApi(
  request: Request,
  env: Env & TransportEnvironment,
  deps: { fetcher?: typeof fetch; archive?: Archive } = {},
) {
  const fetcher = deps.fetcher ?? fetch;
  const path = new URL(request.url).pathname;
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (path.startsWith('/api/rpc/')) {
    const result = await rpc.handle(request, { prefix: '/api/rpc', context: { env } });
    return result.response ?? new Response('Not found', { status: 404, headers });
  }
  if (path !== '/api/generate') return new Response('Not found', { status: 404, headers });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  const pauseReason = generationPauseReason(env);
  if (pauseReason) return Response.json({ error: pauseReason }, { status: 503, headers });
  const controller = new AbortController();
  const onDisconnect = () => controller.abort('client_disconnected');
  if (request.signal.aborted) onDisconnect();
  else request.signal.addEventListener('abort', onDisconnect, { once: true });
  const timer = setTimeout(() => controller.abort('timeout'), 240000);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onDisconnect);
  };
  let requestId: string | undefined;
  let archive: Archive | undefined;
  try {
    assertOrigin(request, env.APP_ORIGIN);
    if (!env.OPENAI_API_KEY) throw new PublicError('生图服务尚未配置', 503);
    const transport = imageTransport(env);
    const input = await parseInput(request, env.ENABLE_PREVIEW_FORMATS === 'true');
    archive = deps.archive ?? createArchive(env);
    if (!(await archive.reserve(input.requestId, input.settings)))
      throw new PublicError('该请求已提交，请勿重复生成。', 409);
    requestId = input.requestId;
    let referenceArchiveFailed = false;
    for (const [index, file] of input.files.images.entries()) {
      try {
        await archive.saveReference(requestId, index, file);
      } catch {
        referenceArchiveFailed = true;
      }
    }
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${env.OPENAI_API_KEY}:${request.headers.get('CF-Connecting-IP') ?? 'local'}`),
    );
    const safetyId = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const upstream = await openImageRequest(
      input.settings,
      input.files,
      env.OPENAI_API_KEY,
      safetyId,
      controller.signal,
      fetcher,
      { requestId, colo: typeof request.cf?.colo === 'string' ? request.cf.colo : undefined },
      transport,
    );
    const events = imageEvents(upstream, input.settings, requestId, archive, referenceArchiveFailed);
    const providerId = upstreamRequestId(upstream);
    const logResponseFailure = (error?: unknown) => {
      const diagnostic = error instanceof ImageResponseError ? error.diagnostic : undefined;
      console.error({
        event: 'image_request_error',
        phase: 'upstream_response',
        requestId: input.requestId,
        upstreamRequestId: providerId,
        transport: transport?.name ?? 'direct',
        model: input.settings.model,
        format: input.settings.output_format,
        stream: input.settings.stream,
        status: upstream.status,
        ...diagnostic,
        reason: imageAbortReason(controller.signal) ?? diagnostic?.reason ?? 'upstream_body_read_failed',
      });
    };
    const encoder = new TextEncoder();
    const activeArchive = archive;
    const activeId = requestId;
    let cancelled = false;
    let settled = false;
    let pending: Generator<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async pull(sink) {
        try {
          if (pending) {
            const chunk = pending.next();
            if (!chunk.done) {
              sink.enqueue(chunk.value);
              return;
            }
            pending = undefined;
          }
          const result = await events.next();
          if (result.done || result.value.type === 'done') settled = true;
          if (cancelled) return;
          if (result.done) {
            cleanup();
            sink.close();
          } else if (result.value.type === 'image') {
            pending = encodeImage(result.value, encoder);
            const head = pending.next();
            if (!head.done) sink.enqueue(head.value);
          } else sink.enqueue(encoder.encode(JSON.stringify(result.value) + '\n'));
        } catch (error) {
          if (cancelled) return;
          settled = true;
          logResponseFailure(error);
          const message =
            imageAbortReason(controller.signal) === 'timeout'
              ? imageTimeoutMessage
              : safeError(error, '接收图片时连接中断了。请稍后再试。');
          await activeArchive.finish(activeId, 'failed').catch(() => {});
          cleanup();
          controller.abort();
          if (cancelled) return;
          sink.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'));
          sink.close();
        }
      },
      async cancel() {
        cancelled = true;
        pending?.return(undefined);
        pending = undefined;
        onDisconnect();
        cleanup();
        await events.return(undefined).catch(() => {});
        if (!settled) {
          logResponseFailure();
          await activeArchive.finish(activeId, 'disconnected').catch(() => {});
        }
      },
    });
    return new Response(stream, {
      headers: { ...headers, 'content-type': 'application/x-ndjson; charset=utf-8' },
    });
  } catch (error) {
    cleanup();
    controller.abort();
    if (requestId && archive) await archive.finish(requestId, 'failed').catch(() => {});
    return Response.json(
      { error: safeError(error) },
      { status: error instanceof PublicError ? error.status : 503, headers },
    );
  }
}
