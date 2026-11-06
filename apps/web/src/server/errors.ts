export class PublicError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export class ImageResponseError extends PublicError {
  constructor(
    message: string,
    readonly diagnostic: {
      reason: string;
      code?: string;
      receivedImages?: number;
      expectedImages?: number;
    },
  ) {
    super(message, 502);
  }
}

export function imageAbortReason(signal: AbortSignal) {
  const reason: unknown = signal.reason;
  return reason === 'timeout' || reason === 'client_disconnected' ? reason : undefined;
}

export const imageTimeoutMessage = '这次生成等待超时。请稍等片刻再试。';
export const unreadableImageMessage = '图片服务返回的数据无法读取。请稍后再试。';

export function safeError(error: unknown, fallback = '请求未完成，请稍后重试。结果不明时请勿连续提交。') {
  return error instanceof PublicError ? error.message : fallback;
}
