// Memory only: retain an unused token across SPA navigation, never across reloads.
// Turnstile tokens last five minutes; leave a margin before server verification.
let token = '';
let expiresAt = 0;
export const turnstileSession = {
  save(value: string) {
    token = value;
    expiresAt = value ? Date.now() + 280_000 : 0;
  },
  read() {
    return Date.now() < expiresAt ? token : '';
  },
  remaining() {
    return Math.max(0, expiresAt - Date.now());
  },
  clear() {
    token = '';
    expiresAt = 0;
  },
  consume() {
    const value = this.read();
    this.clear();
    return value;
  },
};
