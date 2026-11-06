import { z } from 'zod';
import { formats } from '../lib/models';
import type { Settings, OutputEvent } from '../lib/contract';
import type { Archive } from './archive';
import {
  imageAbortReason,
  ImageResponseError,
  imageTimeoutMessage,
  PublicError,
  unreadableImageMessage,
} from './errors';
import { readJSONImages, readSSE } from './stream';
import {
  upstreamDiagnostic,
  upstreamErrorCode,
  upstreamErrorMessage,
  upstreamRequestId,
} from './upstream-error';
import type { ImageTransport } from './transport';

const missingImageMessage = '这次没有收到完整图片。请稍后再试。';

const imageSchema = z.object({
  b64_json: z
    .string()
    .min(1)
    .max(19 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  output_format: z.enum(formats).optional(),
});
export function upstreamBody(
  settings: Settings,
  files: { images: File[]; mask?: File; markup?: File },
  safetyId: string,
) {
  const { mode, prompt, partial_images, ...options } = settings;
  const params = {
    ...options,
    prompt,
    safety_identifier: safetyId,
    ...(settings.stream ? { partial_images } : {}),
  };
  if (mode === 'generate') return JSON.stringify(params);
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (key === 'svg') continue;
    form.set(key, String(value));
  }
  files.images.forEach((file, i) =>
    form.append('image[]', file, `reference-${i}.${file.type.split('/')[1]}`),
  );
  if (files.mask) form.set('mask', files.mask, 'mask.png');
  if (files.markup) form.set('markup', files.markup, 'markup.png');
  return form;
}
export async function openImageRequest(
  settings: Settings,
  files: { images: File[]; mask?: File; markup?: File },
  key: string,
  safetyId: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  context?: { requestId: string; colo?: string },
  transport?: ImageTransport,
) {
  const logContext = {
    transport: transport?.name ?? 'direct',
    requestId: context?.requestId,
    colo: context?.colo,
    model: settings.model,
    format: settings.output_format,
    stream: settings.stream,
  };
  let response: Response;
  try {
    const body = upstreamBody(settings, files, safetyId);
    signal.throwIfAborted();
    response = await fetcher(
      `${transport?.baseURL ?? 'https://api.openai.com/v1'}/images/${settings.mode === 'edit' ? 'edits' : 'generations'}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          ...transport?.headers,
          ...(settings.mode === 'generate' ? { 'content-type': 'application/json' } : {}),
        },
        body,
        signal,
        redirect: 'manual',
      },
    );
  } catch (error) {
    const abortReason = imageAbortReason(signal);
    console.error({
      ...logContext,
      event: 'image_request_error',
      phase: 'upstream_request',
      reason: abortReason ?? 'upstream_fetch_failed',
    });
    if (abortReason === 'client_disconnected') throw error;
    throw new PublicError(
      abortReason === 'timeout' ? imageTimeoutMessage : '暂时连不上图片服务。请稍后再试。',
      503,
    );
  }
  if (!response.ok) {
    const diagnostic = await upstreamDiagnostic(response);
    console.error({
      ...logContext,
      event: 'image_upstream_error',
      phase: 'upstream_request',
      ...diagnostic,
    });
    throw new PublicError(upstreamErrorMessage(diagnostic), response.status === 429 ? 429 : 502);
  }
  if (!response.body) {
    console.error({
      ...logContext,
      event: 'image_request_error',
      phase: 'upstream_response',
      reason: 'missing_response_body',
      status: response.status,
      upstreamRequestId: upstreamRequestId(response),
    });
    throw new PublicError(missingImageMessage, 502);
  }
  return response;
}
export async function* imageEvents(
  response: Response,
  settings: Settings,
  requestId: string,
  archive: Archive,
): AsyncGenerator<OutputEvent> {
  if (!response.body) throw new PublicError(missingImageMessage, 502);
  const events = settings.stream ? readSSE(response.body) : readJSONImages(response.body);
  let count = 0;
  let archiveFailed = false;
  for await (const value of events) {
    if (typeof value !== 'object' || value === null) continue;
    const event = value as Record<string, unknown>;
    if (event.type === 'error' || event.error) {
      const detail = event.error && typeof event.error === 'object' ? event.error : event;
      const code = upstreamErrorCode('code' in detail ? detail.code : undefined);
      throw new ImageResponseError(upstreamErrorMessage({ code }), {
        reason: 'upstream_error_event',
        code,
      });
    }
    const partial =
      settings.stream && typeof event.type === 'string' && event.type.endsWith('.partial_image');
    const final = !settings.stream || (typeof event.type === 'string' && event.type.endsWith('.completed'));
    if (!partial && !final) continue;
    const parsed = imageSchema.safeParse(event);
    if (!parsed.success)
      throw new ImageResponseError(unreadableImageMessage, { reason: 'invalid_image_payload' });
    const format = parsed.data.output_format ?? settings.output_format;
    if (partial) {
      yield { type: 'preview', b64: parsed.data.b64_json, format };
      continue;
    }
    if (count >= settings.n)
      throw new ImageResponseError('图片服务返回了多余的图片。已收到的图片可以保存。', {
        reason: 'unexpected_image_count',
        receivedImages: count + 1,
        expectedImages: settings.n,
      });
    const id = `${requestId}-${count}`;
    let archived = true;
    try {
      await archive.save(requestId, count, { ...settings, output_format: format }, parsed.data.b64_json);
    } catch {
      archived = false;
      archiveFailed = true;
    }
    yield { type: 'image', id, b64: parsed.data.b64_json, format, archived };
    count++;
  }
  if (count !== settings.n)
    throw new ImageResponseError(
      count ? `收到 ${count} 张图片，共请求 ${settings.n} 张。已收到的图片可以保存。` : missingImageMessage,
      {
        reason: 'incomplete_image_response',
        receivedImages: count,
        expectedImages: settings.n,
      },
    );
  await archive.finish(requestId, archiveFailed ? 'archive_failed' : 'complete').catch(() => {});
  yield { type: 'done', count };
}
