import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { turnstileSession } from './turnstile-session';

afterEach(() => {
  turnstileSession.clear();
  vi.useRealTimers();
});
describe('unused Turnstile token across navigation', () => {
  it('retains an unused token without extending its lifetime when read', () => {
    vi.useFakeTimers();
    turnstileSession.save('unused-token');
    vi.advanceTimersByTime(120_000);
    expect(turnstileSession.read()).toBe('unused-token');
    expect(turnstileSession.remaining()).toBe(160_000);
    vi.advanceTimersByTime(160_000);
    expect(turnstileSession.read()).toBe('');
  });
  it('consumes a token once, including when a request later fails', () => {
    turnstileSession.save('single-use-token');
    expect(turnstileSession.consume()).toBe('single-use-token');
    expect(turnstileSession.consume()).toBe('');
    expect(turnstileSession.read()).toBe('');
  });
  it('does not consume expired tokens', () => {
    vi.useFakeTimers();
    turnstileSession.save('expired-token');
    vi.advanceTimersByTime(300_000);
    expect(turnstileSession.consume()).toBe('');
  });
});
