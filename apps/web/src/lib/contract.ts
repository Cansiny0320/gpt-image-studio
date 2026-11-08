import { z } from 'zod';
import { capabilities, formats, models, standardSizes } from './models';

export const settingsSchema = z
  .strictObject({
    mode: z.enum(['generate', 'edit']),
    prompt: z.string().trim().min(1, '请输入提示词').max(32000, '提示词最多 32,000 字符'),
    model: z.enum(models),
    size: z.string().max(30),
    quality: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']),
    n: z.number().int().min(1).max(10),
    background: z.enum(['auto', 'opaque', 'transparent']),
    output_format: z.enum(formats),
    output_compression: z.number().int().min(0).max(100).optional(),
    moderation: z.enum(['auto', 'low']),
    complexity: z.enum(['low', 'medium', 'high']).optional(),
    stream: z.boolean(),
    partial_images: z.number().int().min(0).max(3),
    input_fidelity: z.enum(['low', 'high']).optional(),
    frame_count: z.number().int().min(2).max(16).optional(),
    frame_duration_ms: z.number().int().min(20).max(2000).optional(),
    svg: z
      .strictObject({
        model: z.string().trim().min(1).max(100),
        reasoning: z
          .strictObject({
            effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((s, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const caps = capabilities(s.model);
    if (s.output_format === 'gif' && s.size !== 'auto') {
      const match = /^(\d{1,4})x(\d{1,4})$/.exec(s.size);
      const [w, h] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
      if (!w || !h || w % 16 || h % 16 || Math.max(w, h) > 3840)
        issue('size', 'GIF 帧尺寸须为正数、16 的倍数，最长边不超过 3,840；建议使用自动尺寸');
    } else if (s.output_format !== 'gif' && !standardSizes.some((v) => v === s.size)) {
      const match = /^(\d{3,4})x(\d{3,4})$/.exec(s.size);
      const [w, h] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
      if (
        !caps.customSize ||
        !match ||
        w % 16 ||
        h % 16 ||
        Math.max(w, h) > 3840 ||
        w * h > 8294400 ||
        w * h < 655360 ||
        w / h > 3 ||
        h / w > 3
      )
        issue('size', '尺寸必须符合模型范围：16 的倍数、比例 1:3–3:1、655,360–8,294,400 像素、最长边 3,840');
    }
    if (s.background === 'transparent' && !['png', 'webp'].includes(s.output_format))
      issue('background', '透明背景请使用 PNG 或 WebP');
    if (s.output_compression !== undefined && !['jpeg', 'webp'].includes(s.output_format))
      issue('output_compression', '压缩率仅支持 JPEG 和 WebP');
    if (!s.stream && s.partial_images !== 0) issue('partial_images', '中间预览需要启用流式输出');
    if (s.complexity && !caps.advanced) issue('complexity', '此模型不支持复杂度配置');
    if (['xhigh', 'max'].includes(s.quality) && !caps.advanced) issue('quality', '此模型不支持该质量等级');
    if (
      s.input_fidelity &&
      (s.mode !== 'edit' || !caps.fidelity || (s.input_fidelity === 'high' && !caps.highFidelity))
    )
      issue('input_fidelity', '此模式或模型不支持该保真度');
    if (['svg', 'gif'].includes(s.output_format)) {
      if (!caps.advanced) issue('output_format', '此模型不支持预览格式');
      if (s.stream || s.partial_images) issue('stream', 'SVG / GIF 不支持流式预览');
    }
    if (s.output_format === 'gif' && !caps.gif) issue('output_format', 'GIF 仅支持 GPT Image 2.6 模型');
    if (s.output_format === 'svg' && (s.n !== 1 || s.mode === 'edit'))
      issue('output_format', 'SVG 仅支持单张文生图');
    if (s.svg && s.output_format !== 'svg') issue('svg', 'SVG 作者配置仅用于 SVG');
    if (s.output_format !== 'gif' && (s.frame_count !== undefined || s.frame_duration_ms !== undefined))
      issue('frame_count', '帧配置仅用于 GIF');
  });
export const MAX_IMAGES_PER_REQUEST = 3;
export type Settings = z.infer<typeof settingsSchema>;
export function withoutIntermediatePreviews(settings: Settings): Settings {
  return { ...settings, stream: false, partial_images: 0 };
}
// Keep the historical parameter schema readable for existing ZIP backups.
export const generationSettingsSchema = settingsSchema
  .refine((s) => s.n <= MAX_IMAGES_PER_REQUEST, {
    path: ['n'],
    message: '一次最多生成 3 张图片',
  })
  .transform(withoutIntermediatePreviews);
export const defaultSettings: Settings = {
  mode: 'generate',
  prompt: '',
  model: 'gpt-image-2.6-flare',
  size: '1024x1024',
  quality: 'auto',
  n: 1,
  background: 'auto',
  output_format: 'png',
  moderation: 'auto',
  stream: false,
  partial_images: 0,
};
export const envelopeSchema = z.strictObject({
  settings: generationSettingsSchema,
  requestId: z.uuid(),
  // Accept but ignore tokens sent by tabs opened before CAPTCHA removal.
  turnstileToken: z.string().max(2048).optional(),
});
export type OutputEvent =
  | { type: 'preview'; b64: string; format: Settings['output_format'] }
  | { type: 'image'; id: string; b64: string; format: Settings['output_format']; archived: boolean }
  | { type: 'done'; count: number }
  | { type: 'error'; message: string };
export const outputEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('preview'), b64: z.string(), format: z.enum(formats) }),
  z.object({
    type: z.literal('image'),
    id: z.string(),
    b64: z.string(),
    format: z.enum(formats),
    archived: z.boolean(),
  }),
  z.object({ type: z.literal('done'), count: z.number().int() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
