import { readLimited } from './security';

const codes = new Set([
  'invalid_api_key',
  'unsupported_country_region_territory',
  'model_not_found',
  'insufficient_permissions',
  'permission_denied',
  'insufficient_quota',
  'rate_limit_exceeded',
  'organization_not_verified',
  'organization_usage_limit_exceeded',
  'moderation_blocked',
  'invalid_value',
  'invalid_request_error',
  'request_forbidden',
  'billing_hard_limit_reached',
]);

export async function upstreamDiagnostic(response: Response) {
  let error: Record<string, unknown> = {};
  let bodyKind = 'unknown';
  try {
    const text = new TextDecoder().decode(await readLimited(response.body, 32768));
    if (response.headers.get('content-type')?.includes('text/html') || /^\s*<!?html/i.test(text)) {
      bodyKind = 'html';
    } else {
      const body = JSON.parse(text);
      if (body?.error && typeof body.error === 'object') error = body.error;
      bodyKind = 'json';
    }
  } catch {
    // Only bounded, allowlisted metadata is retained; never log a raw error body.
  }
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error.code === 'string' && codes.has(error.code) ? error.code : 'unknown';
  const reason =
    code === 'unsupported_country_region_territory' ||
    /country.*not supported|region.*not supported/.test(message)
      ? 'region_restricted'
      : /verif/.test(message) && /organi[sz]ation/.test(message)
        ? 'organization_verification_required'
        : code === 'invalid_api_key'
          ? 'invalid_api_key'
          : code === 'insufficient_quota' || /quota|billing|credit/.test(message)
            ? 'quota'
            : /permission|access|not allowed|not authorized/.test(message)
              ? 'permission'
              : bodyKind === 'html'
                ? 'html_response'
                : 'unknown';
  const requestId = response.headers.get('x-request-id');
  return {
    status: response.status,
    code,
    reason,
    bodyKind,
    upstreamRequestId: requestId && /^req_[a-zA-Z0-9_-]{1,100}$/.test(requestId) ? requestId : undefined,
  };
}
