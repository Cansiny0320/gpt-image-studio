import { z } from 'zod';
import { formats } from '../lib/models';
import type { Settings, OutputEvent } from '../lib/contract';
import type { Archive } from './archive';
import { PublicError } from './errors';
import { readJSONImages, readSSE } from './stream';
import { upstreamDiagnostic } from './upstream-error';

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
) {
  const response = await fetcher(
    `https://api.openai.com/v1/images/${settings.mode === 'edit' ? 'edits' : 'generations'}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(settings.mode === 'generate' ? { 'content-type': 'application/json' } : {}),
      },
      body: upstreamBody(settings, files, safetyId),
      signal,
    },
  );
  if (!response.ok) {
    const diagnostic = await upstreamDiagnostic(response);
    console.error({
      event: 'image_upstream_error',
      ...diagnostic,
      requestId: context?.requestId,
      colo: context?.colo,
      model: settings.model,
      format: settings.output_format,
      stream: settings.stream,
    });
    const message =
      diagnostic.reason === 'region_restricted'
        ? '上游生图服务拒绝了当前请求来源地区，请联系站点维护者。'
        : response.status === 429
          ? '生图服务额度不足或请求过于频繁，请稍后再试。'
          : response.status === 401 || response.status === 403
            ? '生图服务暂不可用，请联系站点维护者检查权限。'
            : response.status === 400
              ? '模型未接受这组参数或图片，请调整配置后重试。'
              : '上游生图服务暂时不可用，请稍后重试。';
    throw new PublicError(message, response.status === 429 ? 429 : 502);
  }
  if (!response.body) throw new PublicError('上游未返回图片', 502);
  return response;
}
export async function* imageEvents(
  response: Response,
  settings: Settings,
  requestId: string,
  archive: Archive,
): AsyncGenerator<OutputEvent> {
  if (!response.body) throw new PublicError('上游未返回图片', 502);
  const events = settings.stream ? readSSE(response.body) : readJSONImages(response.body);
  let count = 0;
  let archiveFailed = false;
  for await (const value of events) {
    if (typeof value !== 'object' || value === null) continue;
    const event = value as Record<string, unknown>;
    if (event.type === 'error' || event.error)
      throw new PublicError('生图未完成，请调整提示词或配置后重试。', 502);
    const partial =
      settings.stream && typeof event.type === 'string' && event.type.endsWith('.partial_image');
    const final = !settings.stream || (typeof event.type === 'string' && event.type.endsWith('.completed'));
    if (!partial && !final) continue;
    const parsed = imageSchema.safeParse(event);
    if (!parsed.success) throw new PublicError('上游返回的图片格式无效', 502);
    const format = parsed.data.output_format ?? settings.output_format;
    if (partial) {
      yield { type: 'preview', b64: parsed.data.b64_json, format };
      continue;
    }
    if (count >= settings.n) throw new PublicError('上游返回图片数量异常', 502);
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
    throw new PublicError(`仅收到 ${count} / ${settings.n} 张图片，已收到的图片可以保存。`, 502);
  await archive.finish(requestId, archiveFailed ? 'archive_failed' : 'complete').catch(() => {});
  yield { type: 'done', count };
}
