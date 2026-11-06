import { imageSize } from 'image-size';
import { envelopeSchema } from '../lib/contract';
import { capabilities } from '../lib/models';
import { PublicError } from './errors';
import { MAX_UPLOAD_BYTES, readLimited } from './security';

export async function parseInput(request: Request, previewFormats: boolean) {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data')) throw new PublicError('请求格式错误', 415);
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_UPLOAD_BYTES) throw new PublicError('上传总大小不能超过 24 MB', 413);
  const bytes = await readLimited(request.body, MAX_UPLOAD_BYTES);
  const form = await new Response(bytes, { headers: { 'content-type': type } }).formData();
  const allowed = new Set(['payload', 'image', 'mask', 'markup']);
  for (const name of form.keys()) if (!allowed.has(name)) throw new PublicError('未知的上传字段');
  if (
    form.getAll('payload').length !== 1 ||
    form.getAll('mask').length > 1 ||
    form.getAll('markup').length > 1
  )
    throw new PublicError('重复的请求字段');
  const payload = form.get('payload');
  if (typeof payload !== 'string' || payload.length > 160000) throw new PublicError('请求参数无效');
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw new PublicError('请求参数格式错误');
  }
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) throw new PublicError(parsed.error.issues[0]?.message ?? '参数无效');
  const { settings } = parsed.data;
  if (!previewFormats && ['svg', 'gif'].includes(settings.output_format))
    throw new PublicError('站点尚未开启 SVG / GIF 预览能力');
  const files = form.getAll('image');
  const mask = form.get('mask');
  const markup = form.get('markup');
  if (files.length > 16 || (settings.mode === 'edit' && files.length === 0))
    throw new PublicError('编辑模式需要 1–16 张参考图');
  if (settings.mode === 'generate' && (files.length || mask || markup))
    throw new PublicError('文生图模式不接受参考图');
  if (mask && markup) throw new PublicError('遮罩和标注图不能同时使用');
  if (markup && !capabilities(settings.model).advanced) throw new PublicError('此模型不支持标注图');
  if (mask && settings.output_format === 'gif') throw new PublicError('GIF 不支持遮罩');
  const sourceFiles: File[] = [];
  const dimensions: Array<{ width: number; height: number }> = [];
  for (const file of [...files, ...(mask ? [mask] : []), ...(markup ? [markup] : [])]) {
    if (
      !(file instanceof File) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      !file.size ||
      file.size > 10 * 1024 * 1024
    )
      throw new PublicError('图片需为 PNG / JPEG / WebP，单张不超过 10 MB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let size: ReturnType<typeof imageSize>;
    try {
      size = imageSize(bytes);
    } catch {
      throw new PublicError('无法识别上传的图片');
    }
    if (!size.width || !size.height || size.width * size.height > 16777216)
      throw new PublicError('参考图最多支持 16,777,216 像素');
    const actual = size.type === 'jpg' ? 'image/jpeg' : `image/${size.type}`;
    if (actual !== file.type) throw new PublicError('图片内容与文件类型不一致');
    if (file === mask || file === markup) {
      if (
        size.type !== 'png' ||
        ![4, 6].includes(bytes[25]) ||
        size.width !== dimensions[0]?.width ||
        size.height !== dimensions[0]?.height
      )
        throw new PublicError('遮罩/标注需为带透明通道、与第一张参考图同尺寸的 PNG');
    } else {
      sourceFiles.push(file);
      dimensions.push({ width: size.width, height: size.height });
    }
  }
  return {
    ...parsed.data,
    files: {
      images: sourceFiles,
      mask: mask instanceof File ? mask : undefined,
      markup: markup instanceof File ? markup : undefined,
    },
  };
}
