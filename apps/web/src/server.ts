import startHandler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { env } from 'cloudflare:workers';
import { handleApi } from './server/api';

export default createServerEntry({
  async fetch(request, options) {
    const response = new URL(request.url).pathname.startsWith('/api/')
      ? await handleApi(request, env)
      : await startHandler.fetch(request, options);
    const result = new Response(response.body, response);
    result.headers.set('x-content-type-options', 'nosniff');
    result.headers.set('referrer-policy', 'no-referrer');
    if (new URL(request.url).pathname.startsWith('/api/')) result.headers.set('cache-control', 'no-store');
    return result;
  },
});
