import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { models } from '../lib/models';
import { createArchive, type Archive } from './archive';
import { assertOrigin } from './security';
import { parseInput } from './input';
import { imageEvents, openImageRequest } from './openai';
import { PublicError, safeError } from './errors';
import { imageTransport, type TransportEnvironment } from './transport';

export const router = {
  config: os.$context<{ env: Env }>().handler(({ context }) => ({
    models,
    previewFormats: context.env.ENABLE_PREVIEW_FORMATS === 'true',
    configured: Boolean(context.env.OPENAI_API_KEY && context.env.APP_ORIGIN),
  })),
};
const rpc = new RPCHandler(router);
export type AppRouter = typeof router;
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
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 240000);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
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
    const events = imageEvents(upstream, input.settings, requestId, archive);
    const encoder = new TextEncoder();
    const activeArchive = archive;
    const activeId = requestId;
    const stream = new ReadableStream<Uint8Array>({
      async pull(sink) {
        try {
          const result = await events.next();
          if (result.done) {
            cleanup();
            sink.close();
          } else sink.enqueue(encoder.encode(JSON.stringify(result.value) + '\n'));
        } catch (error) {
          await activeArchive.finish(activeId, 'failed').catch(() => {});
          sink.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: safeError(error) }) + '\n'));
          cleanup();
          controller.abort();
          sink.close();
        }
      },
      async cancel() {
        controller.abort();
        cleanup();
        await events.return(undefined);
        await activeArchive.finish(activeId, 'disconnected').catch(() => {});
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
