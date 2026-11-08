import { none } from 'stream-chain/defs.js';
import { jsonParser, type Token } from 'stream-json/core/parser.js';
import { ImageResponseError, unreadableImageMessage } from './errors';
import { ImageDecoder, type ImagePayload } from './image-payload';

export const MAX_EVENT_BYTES = 20 * 1024 * 1024;

type UpstreamImage = {
  image?: ImagePayload;
  output_format?: unknown;
  type?: unknown;
  error?: unknown;
  code?: unknown;
};
type ErrorDetails = { code?: unknown };
type Frame =
  | { role: 'root' | 'data' | 'skip'; key?: string }
  | { role: 'image'; value: UpstreamImage; key?: string }
  | { role: 'error'; value: ErrorDetails; key?: string };

export async function* readJSONImages(body: ReadableStream<Uint8Array>): AsyncGenerator<UpstreamImage> {
  const tokenize = jsonParser({ packStrings: false, streamKeys: false, streamNumbers: false });
  const reader = body.getReader();
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const frames: Frame[] = [];
  let pendingBytes = 0;
  let stringValue = '';
  let decoder: ImageDecoder | undefined;

  function readTokens(part?: Uint8Array): Token[] {
    try {
      const text = part ? utf8.decode(part, { stream: true }) : utf8.decode();
      // The library types omit the flush sentinel accepted by its tokenizer.
      const tokens = tokenize(text);
      const tail = part ? none : tokenize(none as never);
      return [
        ...(typeof tokens === 'symbol' ? [] : tokens.values),
        ...(typeof tail === 'symbol' ? [] : tail.values),
      ];
    } catch {
      throw new ImageResponseError(unreadableImageMessage, { reason: 'invalid_upstream_json' });
    }
  }

  function assign(frame: Frame | undefined, value: unknown) {
    if (frame?.role === 'image') {
      switch (frame.key) {
        case 'b64_json':
          frame.value.image = undefined;
          break;
        case 'output_format':
        case 'type':
        case 'error':
        case 'code':
          frame.value[frame.key] = value;
      }
    } else if (frame?.role === 'error' && frame.key === 'code') {
      frame.value.code = value;
    }
  }

  function* images(tokens: Token[]): Generator<UpstreamImage> {
    for (const token of tokens) {
      const frame = frames.at(-1);
      switch (token.name) {
        case 'keyValue':
          if (frame) frame.key = token.value;
          break;
        case 'startObject':
        case 'startArray':
          if (!frame && token.name === 'startObject') {
            frames.push({ role: 'root' });
          } else if (frame?.role === 'root' && frame.key === 'data') {
            frames.push({ role: 'data' });
          } else if (frame?.role === 'data') {
            frames.push({ role: 'image', value: {} });
          } else if (frame?.role === 'image' && frame.key === 'error' && token.name === 'startObject') {
            const error = {};
            frame.value.error = error;
            frames.push({ role: 'error', value: error });
          } else {
            assign(frame, true);
            frames.push({ role: 'skip' });
          }
          break;
        case 'endArray':
        case 'endObject': {
          const ended = frames.pop();
          if (ended?.role === 'image') {
            pendingBytes = 0;
            yield ended.value;
          }
          break;
        }
        case 'startString':
          stringValue = '';
          if (frame?.role === 'image' && frame.key === 'b64_json') {
            // Drop a duplicate value before allocating the last one, as with a normal JSON object.
            frame.value.image = undefined;
            decoder = new ImageDecoder();
          }
          break;
        case 'stringChunk':
          if (decoder) decoder.append(token.value);
          else if (stringValue.length < 129) stringValue += token.value.slice(0, 129 - stringValue.length);
          break;
        case 'endString':
          if (frame?.role === 'image' && decoder) {
            frame.value.image = decoder.finish();
            decoder = undefined;
          } else {
            assign(frame, stringValue);
            if (frame?.role === 'data') pendingBytes = 0;
          }
          break;
        case 'numberValue':
        case 'trueValue':
        case 'falseValue':
        case 'nullValue':
          assign(frame, token.name === 'numberValue' ? Number(token.value) : token.value);
          if (frame?.role === 'data') pendingBytes = 0;
          break;
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += 65536) {
        const part = value.subarray(offset, offset + 65536);
        pendingBytes += part.length;
        if (pendingBytes > MAX_EVENT_BYTES)
          throw new ImageResponseError('返回的图片太大。可以选小一点的尺寸，或改用 WebP 后再试。', {
            reason: 'image_response_too_large',
          });
        yield* images(readTokens(part));
      }
    }
    yield* images(readTokens());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
