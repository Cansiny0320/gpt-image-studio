import { useEffect, useRef } from 'react';
type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let scriptPromise: Promise<void> | undefined;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromise = undefined;
        reject(new Error('无法加载人机验证，请检查网络后重试'));
      };
      document.head.appendChild(script);
    });
  return scriptPromise;
}
export function TurnstileWidget({
  siteKey,
  refresh,
  onToken,
  onError,
}: {
  siteKey: string;
  refresh: number;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    let id: string | undefined;
    onToken('');
    void loadScript()
      .then(() => {
        if (!alive || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action: 'generate',
          theme: 'light',
          size: 'flexible',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => {
            onToken('');
            onError('人机验证失败，请重新验证');
          },
        });
      })
      .catch((error) => {
        if (alive) onError(error.message);
      });
    return () => {
      // This flag belongs to this effect instance, not React render state.
      // oxlint-disable-next-line react/immutability
      alive = false;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, refresh, onToken, onError]);
  return <div ref={ref} className="turnstile" />;
}
