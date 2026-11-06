import { PublicError } from './errors';

export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
export function assertOrigin(request: Request, origin: string) {
  if (!origin || request.headers.get('origin') !== origin || new URL(request.url).origin !== origin)
    throw new PublicError('请求来源无效', 403);
}
export async function readLimited(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new PublicError('请求内容为空');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new PublicError('文件或请求超过大小限制', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return data;
}
