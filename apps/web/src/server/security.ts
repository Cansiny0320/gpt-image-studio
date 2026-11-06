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
export async function verifyTurnstile(
  token: string,
  request: Request,
  env: Pick<Env, 'TURNSTILE_SECRET_KEY' | 'APP_ENV' | 'APP_ORIGIN'>,
  fetcher: typeof fetch = fetch,
) {
  if (!env.TURNSTILE_SECRET_KEY) throw new PublicError('人机验证尚未配置', 503);
  const testKey = env.TURNSTILE_SECRET_KEY.startsWith('1x000000');
  const local = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
  if (testKey && !(env.APP_ENV === 'development' && local)) throw new PublicError('人机验证配置无效', 503);
  const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') ?? undefined,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new PublicError('人机验证暂时不可用，请重试', 503);
  const result = await response.json<{ success?: boolean; hostname?: string; action?: string }>();
  if (
    !result.success ||
    (!testKey && (result.hostname !== new URL(env.APP_ORIGIN).hostname || result.action !== 'generate'))
  )
    throw new PublicError('人机验证已失效，请重新验证', 403);
}
