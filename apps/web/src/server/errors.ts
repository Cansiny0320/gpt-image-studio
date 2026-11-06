export class PublicError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function safeError(error: unknown) {
  return error instanceof PublicError ? error.message : '请求未完成，请稍后重试。结果不明时请勿连续提交。';
}
