import { describe, expect, it, vi } from 'vite-plus/test';
import { defaultSettings } from '../lib/contract';
import { imageEvents, openImageRequest, upstreamBody } from './openai';
import { readJSONImages } from './stream';
import { assertOrigin, readLimited } from './security';
import { createArchive, type Archive } from './archive';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUe0AAAAASUVORK5CYII=';
function archive(): Archive {
  return {
    reserve: vi.fn(async () => true),
    saveReference: vi.fn(async () => {}),
    save: vi.fn(async () => 'id'),
    finish: vi.fn(async () => {}),
  };
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
    expect(events[0]).toMatchObject({ type: 'image', archived: false });
    if (events[0].type === 'image')
      expect(Buffer.concat(events[0].image.chunks).toString('base64')).toBe(png);
    expect(events[1].type).toBe('done');
  });
  it('unblocks the archive writer if R2 rejects before reading the image', async () => {
    vi.stubGlobal('FixedLengthStream', function () {
      return new TransformStream();
    });
    const put = vi.fn(async () => {
      throw new Error('storage unavailable');
    });
    const image = Buffer.from(png, 'base64');
    try {
      const storage = createArchive({ DB: {} as Env['DB'], IMAGES: { put } as unknown as Env['IMAGES'] });
      await expect(
        storage.save('job', 0, defaultSettings, { chunks: [image], byteLength: image.length }),
      ).rejects.toThrow('storage unavailable');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('detects truncated streams without declaring success', async () => {
    const collect = async () => {
      for await (const _event of imageEvents(
        new Response(bytes(['{"data":[{"b64_json":"YQ'])),
        defaultSettings,
        'job',
        archive(),
      )) {
        /* consume */
      }
    };
    await expect(collect()).rejects.toMatchObject({ diagnostic: { reason: 'invalid_upstream_json' } });
  });
  it('parses multiple JSON images across network chunks', async () => {
    const json =
      '{"data":[{"b64_json":"YQ\\u003d=","output_format":"png"},{"output_format":"webp","b64_json":"YWI"}],"usage":{"ignored":"text"}}';
    const out = await Array.fromAsync(readJSONImages(bytes([...json])));
    expect(out.map((e) => e.output_format)).toEqual(['png', 'webp']);
    expect(out.map((e) => Buffer.concat(e.image?.chunks ?? []).toString())).toEqual(['a', 'ab']);
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
    ).rejects.toThrow('图片服务暂时无法接收更多请求');
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
      ).rejects.toThrow('图片服务暂时无法处理来自当前地区的请求');
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
