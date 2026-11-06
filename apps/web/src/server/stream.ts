import { JSONParser } from '@streamparser/json';
import { PublicError } from './errors';

export const MAX_EVENT_BYTES = 20 * 1024 * 1024;
export async function* readLines(
  body: ReadableStream<Uint8Array>,
  limit = MAX_EVENT_BYTES,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        if (end > limit) throw new PublicError('单张图片超过处理上限，请降低尺寸或使用 WebP', 502);
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        yield line;
      }
      if (buffer.length > limit) throw new PublicError('单张图片超过处理上限，请降低尺寸或使用 WebP', 502);
      if (done) break;
    }
    if (buffer) yield buffer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  let data: string[] = [];
  let size = 0;
  for await (const line of readLines(body)) {
    if (!line) {
      if (data.length) {
        const text = data.join('\n');
        if (text !== '[DONE]') yield JSON.parse(text);
      }
      data = [];
      size = 0;
    } else if (line.startsWith('data:')) {
      const piece = line.slice(5).trimStart();
      size += piece.length;
      if (size > MAX_EVENT_BYTES) throw new PublicError('图片事件过大', 502);
      data.push(piece);
    }
  }
  if (data.length && data.join('\n') !== '[DONE]') yield JSON.parse(data.join('\n'));
}
export async function* readJSONImages(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const parser = new JSONParser({ paths: ['$.data.*'], keepStack: false, stringBufferSize: 65536 });
  const queue: unknown[] = [];
  let pendingBytes = 0;
  parser.onValue = ({ value }) => {
    queue.push(value);
    pendingBytes = 0;
  };
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Small slices bound the number of completed images retained before backpressure.
      for (let offset = 0; offset < value.length; offset += 65536) {
        const part = value.subarray(offset, offset + 65536);
        pendingBytes += part.length;
        if (pendingBytes > MAX_EVENT_BYTES)
          throw new PublicError('单张图片超过处理上限，请降低尺寸或使用 WebP', 502);
        parser.write(part);
        while (queue.length) yield queue.shift();
      }
    }
    if (!parser.isEnded) parser.end();
    while (queue.length) yield queue.shift();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
