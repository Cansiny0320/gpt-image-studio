import { z } from 'zod';
import { formats } from '../lib/models';
import type { Settings, OutputEvent } from '../lib/contract';
import type { Archive } from './archive';
import { imageAbortReason, ImageResponseError, imageTimeoutMessage, PublicError } from './errors';
import { invalidImagePayload, type ImagePayload } from './image-payload';
import { readJSONImages } from './stream';
import {
  upstreamDiagnostic,
  upstreamErrorCode,
  upstreamErrorMessage,
  upstreamRequestId,
} from './upstream-error';
import type { ImageTransport } from './transport';

const missingImageMessage = '这次没有收到完整图片。请稍后再试。';

const outputFormat = z.enum(formats).optional();
export type ServerImageEvent = Omit<Extract<OutputEvent, { type: 'image' }>, 'b64'> & {
  image: ImagePayload;
};
export function upstreamBody(
  settings: Settings,
  files: { images: File[]; mask?: File; markup?: File },
  safetyId: string,
) {
  const { mode, prompt, partial_images: _partialImages, ...options } = settings;
  const params = {
    ...options,
    prompt,
    safety_identifier: safetyId,
    stream: false,
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
  referenceArchiveFailed = false,
): AsyncGenerator<ServerImageEvent | Extract<OutputEvent, { type: 'done' }>> {
  if (!response.body) throw new PublicError(missingImageMessage, 502);
  let count = 0;
  let archiveFailed = referenceArchiveFailed;
  for await (const event of readJSONImages(response.body)) {
    if (event.type === 'error' || event.error) {
      const detail = event.error && typeof event.error === 'object' ? event.error : event;
      const code = upstreamErrorCode('code' in detail ? detail.code : undefined);
      throw new ImageResponseError(upstreamErrorMessage({ code }), {
        reason: 'upstream_error_event',
        code,
      });
    }
    const parsed = outputFormat.safeParse(event.output_format);
    if (!parsed.success || !event.image) throw invalidImagePayload();
    const format = parsed.data ?? settings.output_format;
    if (count >= settings.n)
      throw new ImageResponseError('图片服务返回了多余的图片。已收到的图片可以保存。', {
        reason: 'unexpected_image_count',
        receivedImages: count + 1,
        expectedImages: settings.n,
      });
    const id = `${requestId}-${count}`;
    let archived = !referenceArchiveFailed;
    try {
      await archive.save(requestId, count, { ...settings, output_format: format }, event.image);
    } catch {
      archived = false;
      archiveFailed = true;
    }
    yield { type: 'image', id, image: event.image, format, archived };
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
