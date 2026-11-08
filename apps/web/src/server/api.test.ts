import { describe, expect, it, vi } from 'vite-plus/test';
import { handleApi } from './api';
import { parseInput } from './input';
import { defaultSettings } from '../lib/contract';
import type { Archive } from './archive';

const origin = 'http://127.0.0.1:4327';
const env = {
  APP_ENV: 'development',
  APP_ORIGIN: origin,
  OPENAI_API_KEY: 'private-test-key',
  ENABLE_PREVIEW_FORMATS: 'false',
} as Env;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUe0AAAAASUVORK5CYII=';
function form(mode: 'generate' | 'edit' = 'generate') {
  const value = new FormData();
  value.set(
    'payload',
    JSON.stringify({
      requestId: crypto.randomUUID(),
      settings: {
        ...defaultSettings,
        prompt: 'A blue cup',
        stream: false,
        partial_images: 0,
        mode,
      },
    }),
  );
  return value;
}
function request(body = form(), from = origin) {
  return new Request(`${origin}/api/generate`, { method: 'POST', headers: { origin: from }, body });
}
function archive(): Archive {
  return {
    reserve: vi.fn(async () => true),
    saveReference: vi.fn<Archive['saveReference']>(async () => {}),
    save: vi.fn(async () => 'image-id'),
    finish: vi.fn(async () => {}),
  };
}
function upstream() {
  return vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: png }] }));
}
describe('API boundary', () => {
  const gatewayEnv = {
    ...env,
    AI_GATEWAY_ACCOUNT_ID: 'a'.repeat(32),
    AI_GATEWAY_ID: 'studio-test',
    AI_GATEWAY_TOKEN: 'private-gateway-token',
  };
  it.each(['generate', 'edit'] as const)(
    'routes %s through the authenticated native gateway',
    async (mode) => {
      const body = form(mode);
      if (mode === 'edit')
        body.set('image', new File([Buffer.from(png, 'base64')], 'test.png', { type: 'image/png' }));
      const fetcher = upstream();
      const a = archive();
      const response = await handleApi(request(body), gatewayEnv, { fetcher, archive: a });
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(
        `https://gateway.ai.cloudflare.com/v1/${gatewayEnv.AI_GATEWAY_ACCOUNT_ID}/studio-test/openai/images/${mode === 'edit' ? 'edits' : 'generations'}`,
      );
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${env.OPENAI_API_KEY}`);
      expect(headers.get('cf-aig-authorization')).toBe(`Bearer ${gatewayEnv.AI_GATEWAY_TOKEN}`);
      expect(headers.get('cf-aig-collect-log')).toBe('false');
      expect(headers.get('cf-aig-skip-cache')).toBe('true');
      expect(headers.get('cf-aig-no-wholesale')).toBe('true');
      expect(headers.get('cf-aig-max-attempts')).toBe('1');
      expect(init?.redirect).toBe('manual');
      expect(text).toContain(png);
      expect(text).not.toContain(gatewayEnv.AI_GATEWAY_TOKEN);
      if (mode === 'edit') {
        expect(headers.has('content-type')).toBe(false);
        expect(init?.body).toBeInstanceOf(FormData);
        expect((init!.body as FormData).getAll('image[]')).toHaveLength(1);
      } else {
        expect(a.saveReference).not.toHaveBeenCalled();
      }
    },
  );
  it.each([{ AI_GATEWAY_TOKEN: '' }, { AI_GATEWAY_ACCOUNT_ID: '' }, { AI_GATEWAY_ID: '../wrong' }])(
    'rejects incomplete or invalid gateway configuration before a paid call: %j',
    async (override) => {
      const fetcher = upstream();
      const a = archive();
      const response = await handleApi(request(), { ...gatewayEnv, ...override }, { fetcher, archive: a });
      expect(response.status).toBe(503);
      expect(fetcher).not.toHaveBeenCalled();
      expect(a.reserve).not.toHaveBeenCalled();
    },
  );
  it('preserves GIF parameters and completed bytes through the gateway', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, {
      output_format: 'gif',
      size: 'auto',
      frame_count: 9,
      frame_duration_ms: 200,
      stream: false,
      partial_images: 0,
    });
    body.set('payload', JSON.stringify(payload));
    const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ data: [{ b64_json: gif, output_format: 'gif' }] }),
    );
    const response = await handleApi(request(body), gatewayEnv, { fetcher, archive: archive() });
    expect(await response.text()).toContain(gif);
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toMatchObject({
      output_format: 'gif',
      frame_count: 9,
      frame_duration_ms: 200,
      stream: false,
    });
  });
  it('forces legacy PNG preview requests to final images only', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, { stream: true, partial_images: 1 });
    body.set('payload', JSON.stringify(payload));
    const fetcher = upstream();
    const a = archive();
    const response = await handleApi(request(body), gatewayEnv, { fetcher, archive: a });
    expect(
      (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).type),
    ).toEqual(['image', 'done']);
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(a.reserve).toHaveBeenCalledWith(
      payload.requestId,
      expect.objectContaining({ stream: false, partial_images: 0 }),
    );
    const upstreamSettings = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(upstreamSettings.stream).toBe(false);
    expect(upstreamSettings).not.toHaveProperty('partial_images');
  });
  it.each(['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'])(
    'accepts GIF without enabling SVG: %s',
    async (model) => {
      const body = form();
      const payload = JSON.parse(body.get('payload') as string);
      Object.assign(payload.settings, {
        model,
        output_format: 'gif',
        frame_count: 9,
        frame_duration_ms: 200,
      });
      body.set('payload', JSON.stringify(payload));
      expect((await parseInput(request(body), false)).settings.output_format).toBe('gif');
    },
  );
  it('rejects 2.5 GIF before contacting upstream services', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, { model: 'gpt-image-2.5-flare', output_format: 'gif' });
    body.set('payload', JSON.stringify(payload));
    const fetcher = upstream();
    const a = archive();
    const response = await handleApi(request(body), env, { fetcher, archive: a });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('2.6');
    expect(fetcher).not.toHaveBeenCalled();
    expect(a.reserve).not.toHaveBeenCalled();
  });
  it('forwards GIF parameters and returns exact bytes with the correct format', async () => {
    const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, {
      output_format: 'gif',
      size: 'auto',
      frame_count: 9,
      frame_duration_ms: 200,
    });
    body.set('payload', JSON.stringify(payload));
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: gif }] }));
    const a = archive();
    const response = await handleApi(request(body), env, { fetcher, archive: a });
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ type: 'image', b64: gif, format: 'gif', archived: true });
    expect(events[1]).toEqual({ type: 'done', count: 1 });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toMatchObject({
      model: 'gpt-image-2.6-flare',
      output_format: 'gif',
      size: 'auto',
      frame_count: 9,
      frame_duration_ms: 200,
    });
    expect(a.save).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ output_format: 'gif' }),
      { chunks: [Buffer.from(gif, 'base64')], byteLength: Buffer.from(gif, 'base64').length },
    );
  });
  it('still rejects SVG when preview formats are disabled', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    payload.settings.output_format = 'svg';
    body.set('payload', JSON.stringify(payload));
    await expect(parseInput(request(body), false)).rejects.toThrow('SVG');
  });
  it('rejects batches over three before archival or generation', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    payload.settings.n = 4;
    body.set('payload', JSON.stringify(payload));
    const fetcher = upstream();
    const a = archive();
    const response = await handleApi(request(body), env, { fetcher, archive: a });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('最多生成 3 张');
    expect(fetcher).not.toHaveBeenCalled();
    expect(a.reserve).not.toHaveBeenCalled();
  });
  it('rejects another origin before archival or generation', async () => {
    const fetcher = upstream();
    const a = archive();
    const response = await handleApi(request(form(), 'https://other.test'), env, {
      fetcher,
      archive: a,
    });
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    expect(a.reserve).not.toHaveBeenCalled();
  });
  it('never offers user-facing archive reads', async () => {
    const fetcher = upstream();
    for (const path of ['/api/history', '/api/images/example.png']) {
      expect((await handleApi(new Request(origin + path), env, { fetcher })).status).toBe(404);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('stops duplicate submissions before contacting OpenAI', async () => {
    const body = form('edit');
    body.set('image', new File([Buffer.from(png, 'base64')], 'reference.png', { type: 'image/png' }));
    const a = archive();
    a.reserve = vi.fn(async () => false);
    const fetcher = upstream();
    const response = await handleApi(request(body), env, { fetcher, archive: a });
    expect(response.status).toBe(409);
    expect(a.saveReference).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('records the selected settings even when generation fails before returning an image', async () => {
    const body = form('edit');
    body.set('image', new File([Buffer.from(png, 'base64')], 'reference.png', { type: 'image/png' }));
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, { size: '1536x1024', quality: 'high', output_format: 'webp' });
    body.set('payload', JSON.stringify(payload));
    const a = archive();
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError(payload.settings.prompt);
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await handleApi(request(body), env, { fetcher, archive: a });

      expect(response.status).toBe(503);
      expect(a.reserve).toHaveBeenCalledWith(payload.requestId, payload.settings);
      expect(a.reserve).toHaveBeenCalledBefore(fetcher);
      expect(a.saveReference).toHaveBeenCalledExactlyOnceWith(payload.requestId, 0, expect.any(File));
      expect(a.saveReference).toHaveBeenCalledBefore(fetcher);
      expect(a.finish).toHaveBeenCalledWith(payload.requestId, 'failed');
      expect(a.save).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          requestId: payload.requestId,
          phase: 'upstream_request',
          reason: 'upstream_fetch_failed',
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(payload.settings.prompt);
    } finally {
      log.mockRestore();
    }
  });
  it.each([
    [
      '{"data":[{"type":"error","error":{"code":"moderation_blocked","message":"A blue cup"}}]}',
      { reason: 'upstream_error_event', code: 'moderation_blocked' },
    ],
    [
      '{"data":[{"type":"error","code":"A blue cup","message":"A blue cup"}]}',
      { reason: 'upstream_error_event', code: 'unknown' },
    ],
    ['A blue cup', { reason: 'invalid_upstream_json' }],
    ['{"data":[]}', { reason: 'incomplete_image_response', receivedImages: 0, expectedImages: 1 }],
  ])('logs a sanitized reason when reading the upstream response fails (%j)', async (json, diagnostic) => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, { stream: true, partial_images: 1 });
    body.set('payload', JSON.stringify(payload));
    const a = archive();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await handleApi(request(body), env, {
        archive: a,
        fetcher: async () => new Response(json, { headers: { 'x-request-id': 'req_stream' } }),
      });

      expect(await response.text()).toContain('"type":"error"');
      expect(a.finish).toHaveBeenCalledWith(payload.requestId, 'failed');
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          requestId: payload.requestId,
          upstreamRequestId: 'req_stream',
          phase: 'upstream_response',
          ...diagnostic,
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(payload.settings.prompt);
    } finally {
      log.mockRestore();
    }
  });
  it.each([
    [false, 400, 'moderation_blocked', '这次生成未通过 OpenAI API 的内容审核。可以调整提示词后再试。'],
    [true, 400, 'moderation_blocked', '这次生成未通过 OpenAI API 的内容审核。可以调整提示词后再试。'],
    [false, 429, 'rate_limit_exceeded', '图片服务现在比较忙。请等一会儿再试。'],
    [true, 429, 'rate_limit_exceeded', '图片服务现在比较忙。请等一会儿再试。'],
    [false, 429, 'insufficient_quota', '图片服务的使用额度暂时不足。请联系站点维护者。'],
  ])(
    'explains an upstream rejection (stream: %s, status: %s, code: %s)',
    async (stream, status, code, message) => {
      const body = form();
      const payload = JSON.parse(body.get('payload') as string);
      Object.assign(payload.settings, { stream, partial_images: stream ? 1 : 0 });
      body.set('payload', JSON.stringify(payload));
      const error = { code, message: 'Raw upstream details' };
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await handleApi(request(body), env, {
          archive: archive(),
          fetcher: async () => Response.json({ error }, { status }),
        });

        const result = JSON.parse(await response.text());
        expect(result.error).toBe(message);
      } finally {
        log.mockRestore();
      }
    },
  );
  it.each(['upstream_request', 'upstream_response'] as const)(
    'logs the actual timeout phase (%s)',
    async (phase) => {
      const body = form();
      const payload = JSON.parse(body.get('payload') as string);
      const a = archive();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ready = Promise.withResolvers<void>();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const pending = handleApi(request(body), env, {
          archive: a,
          fetcher: async (_url, init) => {
            const signal = init!.signal!;
            ready.resolve();
            if (phase === 'upstream_request') {
              return new Promise<Response>((_, reject) =>
                signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
              );
            }
            return new Response(
              new ReadableStream({
                start(sink) {
                  signal.addEventListener('abort', () => sink.error(signal.reason), { once: true });
                },
              }),
            );
          },
        });
        await ready.promise;
        const output = pending.then((response) => response.text());
        await vi.advanceTimersByTimeAsync(240_000);
        const result = JSON.parse(await output);

        expect(phase === 'upstream_request' ? result.error : result.message).toBe(
          '这次生成等待超时。请稍等片刻再试。',
        );
        expect(a.finish).toHaveBeenCalledWith(payload.requestId, 'failed');
        expect(log).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ requestId: payload.requestId, phase, reason: 'timeout' }),
        );
      } finally {
        vi.useRealTimers();
        log.mockRestore();
      }
    },
  );
  it('returns final bytes while retaining the key exclusively in the upstream header', async () => {
    const a = archive();
    const fetcher = upstream();
    const response = await handleApi(request(), env, { fetcher, archive: a });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(text).toContain(png);
    expect(text).not.toContain(env.OPENAI_API_KEY);
    expect(
      text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).type),
    ).toEqual(['image', 'done']);
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe(
      `Bearer ${env.OPENAI_API_KEY}`,
    );
  });
  it('delivers multiple complete NDJSON images in bounded chunks with their original bytes', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    payload.settings.n = 2;
    body.set('payload', JSON.stringify(payload));
    const expected = [Buffer.alloc(48_001, 0x5a), Buffer.alloc(53_002, 0xa5)];
    const a = archive();
    const fetcher = async () =>
      Response.json({ data: expected.map((bytes) => ({ b64_json: bytes.toString('base64') })) });
    const response = await handleApi(request(body), env, { fetcher, archive: a });
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body!) chunks.push(chunk);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(16 * 1024);
    const records = Buffer.concat(chunks)
      .toString()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records.map((event) => event.type)).toEqual(['image', 'image', 'done']);
    expect(records.slice(0, 2).map((event) => Buffer.from(event.b64, 'base64'))).toEqual(expected);
    expect(records.slice(0, 2).map((event) => event.id)).toEqual([
      `${payload.requestId}-0`,
      `${payload.requestId}-1`,
    ]);
    expect(a.finish).toHaveBeenCalledWith(payload.requestId, 'complete');
  });
  it('cancels the upstream body when the browser stops during an image record', async () => {
    const a = archive();
    const body = form();
    const { requestId } = JSON.parse(body.get('payload') as string);
    const onCancel = vi.fn();
    const fetcher = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(sink) {
            sink.enqueue(new TextEncoder().encode(`{"data":[{"b64_json":"${png}"}`));
          },
          cancel: onCancel,
        }),
      );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await handleApi(request(body), env, { fetcher, archive: a });
      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('"type":"image"');
      await reader.cancel();
      expect(onCancel).toHaveBeenCalledOnce();
      expect(a.finish).toHaveBeenCalledWith(requestId, 'disconnected');
      expect(a.finish).not.toHaveBeenCalledWith(requestId, 'complete');
    } finally {
      log.mockRestore();
    }
  });
  it('accepts legacy tokens without performing verification', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    payload.turnstileToken = 'expired-token-from-old-tab';
    body.set('payload', JSON.stringify(payload));
    const fetcher = upstream();
    const response = await handleApi(request(body), env, { fetcher, archive: archive() });
    expect(response.status).toBe(200);
    await response.text();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.body).not.toContain('expired-token');
  });
  it('generates without a CAPTCHA token or Turnstile bindings in production', async () => {
    const fetcher = upstream();
    const response = await handleApi(
      request(),
      { ...env, APP_ENV: 'production' },
      { fetcher, archive: archive() },
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.openai.com/v1/images/generations');
  });
});
describe('Japan relay', () => {
  const relayEnv = {
    ...env,
    IMAGE_RELAY_ORIGIN: 'https://image-origin.example:8443',
    IMAGE_RELAY_TOKEN: 'private-relay-token',
  };
  it.each(['generate', 'edit'] as const)(
    'authenticates %s without forwarding visitor headers',
    async (mode) => {
      const body = form(mode);
      if (mode === 'edit')
        body.set('image', new File([Buffer.from(png, 'base64')], 'test.png', { type: 'image/png' }));
      const req = request(body);
      req.headers.set('cf-ipcountry', 'CN');
      req.headers.set('x-forwarded-for', '192.0.2.1');
      const fetcher = upstream();
      const response = await handleApi(req, relayEnv, { fetcher, archive: archive() });
      const result = await response.text();
      expect(response.status).toBe(200);
      expect(fetcher.mock.calls[0][0]).toBe(
        `https://image-origin.example:8443/v1/images/${mode === 'edit' ? 'edits' : 'generations'}`,
      );
      const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
      expect(headers.get('x-studio-relay-token')).toBe(relayEnv.IMAGE_RELAY_TOKEN);
      expect(headers.get('authorization')).toBe(`Bearer ${env.OPENAI_API_KEY}`);
      expect(headers.has('cf-ipcountry')).toBe(false);
      expect(headers.has('x-forwarded-for')).toBe(false);
      expect(headers.has('cf-aig-authorization')).toBe(false);
      expect(result).not.toContain(relayEnv.IMAGE_RELAY_TOKEN);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { IMAGE_RELAY_TOKEN: '' },
    { IMAGE_RELAY_ORIGIN: 'http://image-origin.example' },
    { IMAGE_RELAY_ORIGIN: 'https://user:pass@image-origin.example' },
    { IMAGE_RELAY_ORIGIN: 'https://image-origin.example/path' },
    { AI_GATEWAY_ID: 'also-enabled' },
  ])('fails closed before archival for unsafe or ambiguous relay configuration: %j', async (override) => {
    const fetcher = upstream();
    const a = archive();
    const response = await handleApi(request(), { ...relayEnv, ...override }, { fetcher, archive: a });
    expect(response.status).toBe(503);
    expect(a.reserve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('reference uploads', () => {
  it.each(['mask', 'markup'])(
    'archives original references in upload order and excludes %s',
    async (field) => {
      const body = form('edit');
      const bytes = Buffer.from(png, 'base64');
      const files = ['first.png', 'second.png'].map((name) => new File([bytes], name, { type: 'image/png' }));
      for (const file of files) body.append('image', file);
      body.set(field, new File([bytes], 'guide.png', { type: 'image/png' }));
      const { requestId } = JSON.parse(body.get('payload') as string);
      const a = archive();
      const fetcher = upstream();

      const response = await handleApi(request(body), env, { fetcher, archive: a });
      expect(response.status).toBe(200);
      await response.text();
      const saveReference = vi.mocked(a.saveReference);
      expect(a.reserve).toHaveBeenCalledBefore(saveReference);
      expect(saveReference).toHaveBeenCalledBefore(fetcher);
      const calls = saveReference.mock.calls;
      expect(calls).toHaveLength(2);
      for (const [index, [id, position, file]] of calls.entries()) {
        expect([id, position, file.name, file.type]).toEqual([
          requestId,
          index,
          files[index].name,
          'image/png',
        ]);
        expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
      }
      expect(a.finish).toHaveBeenCalledWith(requestId, 'complete');
    },
  );

  it('continues saving references and returns the final image when one reference write fails', async () => {
    const body = form('edit');
    const bytes = Buffer.from(png, 'base64');
    for (const name of ['first.png', 'second.png']) {
      body.append('image', new File([bytes], name, { type: 'image/png' }));
    }
    const { requestId } = JSON.parse(body.get('payload') as string);
    const a = archive();
    vi.mocked(a.saveReference).mockRejectedValueOnce(new Error('storage unavailable'));

    const response = await handleApi(request(body), env, { fetcher: upstream(), archive: a });
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events).toEqual([
      expect.objectContaining({ type: 'image', b64: png, archived: false }),
      { type: 'done', count: 1 },
    ]);
    expect(a.saveReference).toHaveBeenCalledTimes(2);
    expect(a.saveReference).toHaveBeenNthCalledWith(2, requestId, 1, expect.any(File));
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(a.finish).toHaveBeenCalledWith(requestId, 'archive_failed');
  });

  it('checks image content instead of trusting the MIME label', async () => {
    const body = form('edit');
    body.set('image', new File(['not an image'], 'fake.png', { type: 'image/png' }));
    await expect(parseInput(request(body), false)).rejects.toThrow('无法识别');
    const a = archive();
    const fetcher = upstream();
    expect((await handleApi(request(body), env, { fetcher, archive: a })).status).toBe(400);
    expect(a.saveReference).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts a real PNG and rejects a second mutually exclusive edit guide', async () => {
    const image = new File([Buffer.from(png, 'base64')], 'reference.png', { type: 'image/png' });
    const body = form('edit');
    body.set('image', image);
    expect((await parseInput(request(body), false)).files.images).toHaveLength(1);
    body.set('mask', image);
    body.set('markup', image);
    await expect(parseInput(request(body), false)).rejects.toThrow('不能同时使用');
  });
});
