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
      const response = await handleApi(request(body), gatewayEnv, { fetcher, archive: archive() });
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
  it('preserves PNG streaming previews through the gateway', async () => {
    const body = form();
    const payload = JSON.parse(body.get('payload') as string);
    Object.assign(payload.settings, { stream: true, partial_images: 1 });
    body.set('payload', JSON.stringify(payload));
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          ['image_generation.partial_image', 'image_generation.completed']
            .map((type) => `data: ${JSON.stringify({ type, b64_json: png })}\n\n`)
            .join(''),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const a = archive();
    const response = await handleApi(request(body), gatewayEnv, { fetcher, archive: a });
    expect(
      (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).type),
    ).toEqual(['preview', 'image', 'done']);
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toMatchObject({
      stream: true,
      partial_images: 1,
    });
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
      gif,
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
    const a = archive();
    a.reserve = vi.fn(async () => false);
    const fetcher = upstream();
    const response = await handleApi(request(), env, { fetcher, archive: a });
    expect(response.status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
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
  it('checks image content instead of trusting the MIME label', async () => {
    const body = form('edit');
    body.set('image', new File(['not an image'], 'fake.png', { type: 'image/png' }));
    await expect(parseInput(request(body), false)).rejects.toThrow('无法识别');
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
