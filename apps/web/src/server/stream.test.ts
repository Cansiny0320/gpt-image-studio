import { describe, expect, it } from 'vite-plus/test';
import { readLines, readSSE } from './stream';

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

describe('SSE line framing', () => {
  it('parses a large fragmented image without exhausting the CPU budget', { timeout: 30_000 }, async () => {
    const b64 = 'A'.repeat(8 * 1024 * 1024);
    const image = { type: 'image_generation.completed', b64_json: b64 };
    const stream = chunked(`data: ${JSON.stringify(image)}\r\n\r\ndata: [DONE]\r\n\r\n`, 1024);
    const start = process.cpuUsage();
    const events = await Array.fromAsync(readSSE(stream));
    const { user, system } = process.cpuUsage(start);

    // Leave ample headroom for CI while catching the multi-second rescans of the old parser.
    expect((user + system) / 1000).toBeLessThan(2000);
    expect(events).toEqual([image]);
  });

  it('preserves split UTF-8, CRLF, empty lines, and a final unterminated line', async () => {
    const stream = chunked('甲\r\n\n乙\nlast', 2);
    await expect(Array.fromAsync(readLines(stream, 4))).resolves.toEqual(['甲', '', '乙', 'last']);
  });

  it.each([2, 8])('rejects an oversized line with %i-byte chunks', async (chunkSize) => {
    const stream = chunked('12345\n', chunkSize);
    await expect(Array.fromAsync(readLines(stream, 4))).rejects.toMatchObject({
      diagnostic: { reason: 'image_response_too_large' },
    });
  });
});
