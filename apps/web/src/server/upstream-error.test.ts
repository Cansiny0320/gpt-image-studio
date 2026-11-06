import { expect, it, vi } from 'vite-plus/test';
import { openImageRequest } from './openai';
import { defaultSettings } from '../lib/contract';

it('logs safe upstream diagnostics without keys, prompts or raw bodies', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = Response.json(
      {
        error: {
          code: 'unsupported_country_region_territory',
          type: 'request_forbidden',
          message: 'Country, region, or territory not supported. private prompt and secret-key',
        },
      },
      { status: 403, headers: { 'x-request-id': 'req_123abc' } },
    );
    await expect(
      openImageRequest(
        { ...defaultSettings, prompt: 'private prompt' },
        { images: [] },
        'secret-key',
        'anonymous',
        new AbortController().signal,
        async () => response,
        { requestId: 'local-id', colo: 'HKG' },
      ),
    ).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'image_upstream_error',
        status: 403,
        code: 'unsupported_country_region_territory',
        reason: 'region_restricted',
        upstreamRequestId: 'req_123abc',
        requestId: 'local-id',
        colo: 'HKG',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private prompt|secret-key/);
  } finally {
    log.mockRestore();
  }
});

it('handles HTML errors and malformed metadata without exposing their content', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(
      openImageRequest(
        defaultSettings,
        { images: [] },
        'secret-key',
        'anonymous',
        new AbortController().signal,
        async () =>
          new Response('<html>secret-key</html>', {
            status: 403,
            headers: { 'content-type': 'text/html', 'x-request-id': 'secret-key' },
          }),
      ),
    ).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, reason: 'html_response', upstreamRequestId: undefined }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-key');
  } finally {
    log.mockRestore();
  }
});
