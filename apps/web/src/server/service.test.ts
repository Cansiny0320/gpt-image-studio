import { describe, expect, it, vi } from 'vite-plus/test';
import { defaultSettings } from '../lib/contract';
import { imageEvents, openImageRequest, upstreamBody } from './openai';
import { readSSE, readJSONImages } from './stream';
import { assertOrigin, readLimited } from './security';
import type { Archive } from './archive';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUe0AAAAASUVORK5CYII=';
function archive(): Archive {
  return { reserve: vi.fn(async () => true), save: vi.fn(async () => 'id'), finish: vi.fn(async () => {}) };
}
function bytes(parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      parts.forEach((p) => c.enqueue(encoder.encode(p)));
      c.close();
    },
  });
}
describe('upstream response and archival', () => {
  it.each(['generate', 'edit'] as const)(
    'omits streaming-only fields from nonstreaming %s requests',
    (mode) => {
      const body = upstreamBody(
        { ...defaultSettings, mode, stream: false, partial_images: 0 },
        { images: [] },
        'anonymous',
      );
      const payload = typeof body === 'string' ? JSON.parse(body) : Object.fromEntries(body);
      expect(payload.partial_images).toBeUndefined();
    },
  );
  it('parses fragmented SSE and archives final images only', async () => {
    const a = archive();
    const text = `data: ${JSON.stringify({ type: 'image_generation.partial_image', b64_json: png })}\r\n\r\ndata: ${JSON.stringify({ type: 'image_generation.completed', b64_json: png })}\r\n\r\n`;
    const stream = bytes([...text]);
    const events = [];
    for await (const event of imageEvents(new Response(stream), defaultSettings, 'job', a))
      events.push(event);
    expect(events.map((e) => e.type)).toEqual(['preview', 'image', 'done']);
    expect(a.save).toHaveBeenCalledTimes(1);
  });
  it('keeps the completed image downloadable if archive storage fails', async () => {
    const a = archive();
    a.save = vi.fn(async () => {
      throw new Error('internal DB detail');
    });
    const events = [];
    for await (const e of imageEvents(
      Response.json({ data: [{ b64_json: png }] }),
      { ...defaultSettings, stream: false, partial_images: 0 },
      'job',
      a,
    ))
      events.push(e);
    expect(events[0]).toMatchObject({ type: 'image', b64: png, archived: false });
    expect(events[1].type).toBe('done');
  });
  it('detects truncated streams without declaring success', async () => {
    const collect = async () => {
      for await (const _event of imageEvents(
        new Response(bytes(['data: {"type":"image_generation.partial_image","b64_json":"YQ=="}\n\n'])),
        defaultSettings,
        'job',
        archive(),
      )) {
        /* consume */
      }
    };
    await expect(collect()).rejects.toThrow('0 / 1');
  });
  it('parses multiple JSON images across network chunks', async () => {
    const out = [];
    const json = JSON.stringify({ data: [{ b64_json: png }, { b64_json: png }], usage: { total_tokens: 2 } });
    for await (const e of readJSONImages(bytes([...json]))) out.push(e);
    expect(out).toHaveLength(2);
  });
  it('handles SSE comments and a final event without trailing newline', async () => {
    const out = [];
    for await (const e of readSSE(bytes([': ping\n\ndata: {"ok":true}']))) out.push(e);
    expect(out).toEqual([{ ok: true }]);
  });
  it('does not retry failed API calls or leak upstream bodies', async () => {
    const fetcher = vi.fn(async () => new Response('secret diagnostic', { status: 429 }));
    await expect(
      openImageRequest(
        defaultSettings,
        { images: [] },
        'test-secret',
        'anonymous',
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('额度不足');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reports region restrictions without exposing upstream details', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const fetcher = vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 'unsupported_country_region_territory',
              message: 'Country not supported; private diagnostic',
            },
          },
          { status: 403 },
        ),
      );
      await expect(
        openImageRequest(
          defaultSettings,
          { images: [] },
          'private-key',
          'anonymous',
          new AbortController().signal,
          fetcher,
          { requestId: 'job', colo: 'SEA' },
        ),
      ).rejects.toThrow('上游生图服务拒绝了当前请求来源地区');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'image_upstream_error',
          reason: 'region_restricted',
          requestId: 'job',
          colo: 'SEA',
        }),
      );
      expect(JSON.stringify(logger.mock.calls)).not.toContain('private');
    } finally {
      logger.mockRestore();
    }
  });
  it('excludes UI mode and never includes credentials in the provider body', () => {
    const payload = JSON.parse(upstreamBody(defaultSettings, { images: [] }, 'anonymous') as string);
    expect(payload.mode).toBeUndefined();
    expect(payload.safety_identifier).toBe('anonymous');
    expect(payload.api_key).toBeUndefined();
  });
});
describe('request security', () => {
  it('rejects cross-origin and missing-origin requests', () => {
    expect(() =>
      assertOrigin(new Request('https://studio.test/api/generate'), 'https://studio.test'),
    ).toThrow();
    expect(() =>
      assertOrigin(
        new Request('https://studio.test/api/generate', { headers: { origin: 'https://evil.test' } }),
        'https://studio.test',
      ),
    ).toThrow();
  });
  it('bounds bodies even without content-length', async () => {
    await expect(readLimited(bytes(['12345', '67890']), 8)).rejects.toThrow('大小限制');
  });
});
