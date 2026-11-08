export async function* readLines(body: ReadableStream<Uint8Array>, limit: number): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let parts: string[] = [];
  let length = 0;
  function check(size: number) {
    if (size > limit) throw new Error('返回图片过大，请降低尺寸');
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
      let start = 0;
      let end: number;
      while ((end = chunk.indexOf('\n', start)) >= 0) {
        check(length + end - start);
        parts.push(chunk.slice(start, end));
        const line = parts.join('').replace(/\r$/, '');
        parts = [];
        length = 0;
        start = end + 1;
        yield line;
      }
      if (start < chunk.length) {
        length += chunk.length - start;
        check(length);
        parts.push(chunk.slice(start));
      }
      if (done) break;
    }
    if (length) yield parts.join('');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
