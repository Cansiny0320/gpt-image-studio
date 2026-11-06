import { imageTimeoutMessage } from './errors';
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

export function upstreamErrorCode(code: unknown) {
  return typeof code === 'string' && codes.has(code) ? code : 'unknown';
}

export function upstreamRequestId(response: Response) {
  const id = response.headers.get('x-request-id');
  return id && /^req_[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : undefined;
}

export function upstreamErrorMessage({
  code,
  reason,
  status,
}: {
  code: string;
  reason?: string;
  status?: number;
}) {
  if (code === 'moderation_blocked') return '这次生成未通过 OpenAI API 的内容审核。可以调整提示词后再试。';
  if (code === 'unsupported_country_region_territory' || reason === 'region_restricted')
    return '图片服务暂时无法处理来自当前地区的请求。请联系站点维护者。';
  if (code === 'model_not_found') return '当前模型暂不可用。可以换一个模型后再试。';
  if (code === 'rate_limit_exceeded') return '图片服务现在比较忙。请等一会儿再试。';
  if (
    reason === 'quota' ||
    code === 'insufficient_quota' ||
    code === 'organization_usage_limit_exceeded' ||
    code === 'billing_hard_limit_reached'
  )
    return '图片服务的使用额度暂时不足。请联系站点维护者。';
  if (
    reason === 'organization_verification_required' ||
    reason === 'permission' ||
    [
      'invalid_api_key',
      'insufficient_permissions',
      'permission_denied',
      'organization_not_verified',
      'request_forbidden',
    ].includes(code) ||
    status === 401 ||
    status === 403
  )
    return '站点暂时无法使用图片服务。请联系站点维护者。';
  if (status === 429) return '图片服务暂时无法接收更多请求。请稍后再试。';
  if (status === 408 || status === 504) return imageTimeoutMessage;
  if (status === 400 || code === 'invalid_request_error' || code === 'invalid_value')
    return '图片服务无法处理这组设置或参考图。可以调整后再试。';
  return '图片服务暂时没能完成这次请求。请稍后再试。';
}

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
  const code = upstreamErrorCode(error.code);
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
  return {
    status: response.status,
    code,
    reason,
    bodyKind,
    upstreamRequestId: upstreamRequestId(response),
  };
}
