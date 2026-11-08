import { describe, expect, it } from 'vite-plus/test';
import { readLines } from '../lib/read-lines';
import { MAX_EVENT_BYTES, readJSONImages } from './stream';
import { MAX_BASE64_CHARS } from './image-payload';

function chunked(text: string, chunkSize: number) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

describe('browser NDJSON line framing', () => {
  it('reads a large fragmented image line without rescanning prefixes', { timeout: 30_000 }, async () => {
    const b64 = 'A'.repeat(8 * 1024 * 1024);
    const line = JSON.stringify({ type: 'image', b64 });
    const stream = chunked(line + '\r\n', 1024);
    const start = process.cpuUsage();
    const lines = await Array.fromAsync(readLines(stream, MAX_EVENT_BYTES));
    const { user, system } = process.cpuUsage(start);

    // Leave ample headroom for CI while catching the multi-second rescans of the old parser.
    expect((user + system) / 1000).toBeLessThan(2000);
    expect(lines).toEqual([line]);
  });

  it('preserves split UTF-8, CRLF, empty lines, and a final unterminated line', async () => {
    const stream = chunked('甲\r\n\n乙\nlast', 2);
    await expect(Array.fromAsync(readLines(stream, 4))).resolves.toEqual(['甲', '', '乙', 'last']);
  });

  it.each([2, 8])('rejects an oversized line with %i-byte chunks', async (chunkSize) => {
    const stream = chunked('12345\n', chunkSize);
    await expect(Array.fromAsync(readLines(stream, 4))).rejects.toThrow('返回图片过大');
  });
});

describe('upstream image decoding', () => {
  it.each(['AA=A', 'AA===', 'A', '=AAA'])(
    'rejects invalid Base64 across chunk boundaries: %s',
    async (b64) => {
      await expect(
        Array.fromAsync(readJSONImages(chunked(JSON.stringify({ data: [{ b64_json: b64 }] }), 1))),
      ).rejects.toMatchObject({ diagnostic: { reason: 'invalid_image_payload' } });
    },
  );

  it('retains the image and event size limits', async () => {
    const image = chunked(JSON.stringify({ data: [{ b64_json: 'A'.repeat(MAX_BASE64_CHARS + 4) }] }), 65536);
    await expect(Array.fromAsync(readJSONImages(image))).rejects.toMatchObject({
      diagnostic: { reason: 'invalid_image_payload' },
    });
    const oversizedEvent = chunked(' '.repeat(MAX_EVENT_BYTES + 1), 65536);
    await expect(Array.fromAsync(readJSONImages(oversizedEvent))).rejects.toMatchObject({
      diagnostic: { reason: 'image_response_too_large' },
    });
  });
});
