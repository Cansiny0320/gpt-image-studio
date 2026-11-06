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
  TURNSTILE_SITE_KEY: 'public-site-key',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  ENABLE_PREVIEW_FORMATS: 'false',
} as Env;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUe0AAAAASUVORK5CYII=';
function form(mode: 'generate' | 'edit' = 'generate') {
  const value = new FormData();
  value.set(
    'payload',
    JSON.stringify({
      requestId: crypto.randomUUID(),
      turnstileToken: 'test-token',
      settings: { ...defaultSettings, prompt: 'A blue cup', stream: false, partial_images: 0, mode },
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
  return vi.fn<typeof fetch>(async (url) =>
    String(url).includes('siteverify')
      ? Response.json({ success: true })
      : Response.json({ data: [{ b64_json: png }] }),
  );
}
describe('API boundary', () => {
  it('rejects batches over three before verification, archival or generation', async () => {
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
  it('rejects another origin before verification, archival or generation', async () => {
    const fetcher = upstream();
    const a = archive();
    const response = await handleApi(request(form(), 'https://other.test'), env, { fetcher, archive: a });
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
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('siteverify');
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
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('authorization')).toBe(
      `Bearer ${env.OPENAI_API_KEY}`,
    );
  });
  it('rejects production use of the local Turnstile test secret', async () => {
    const fetcher = upstream();
    const response = await handleApi(
      request(),
      { ...env, APP_ENV: 'production' },
      { fetcher, archive: archive() },
    );
    expect(response.status).toBe(503);
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
