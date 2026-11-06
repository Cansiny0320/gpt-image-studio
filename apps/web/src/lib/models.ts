export const models = [
  'gpt-image-2.6-flare',
  'gpt-image-2.6-sunburst',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare-2026-09-08',
  'gpt-image-2.5-sunburst-2026-09-08',
  'gpt-image-2',
  'gpt-image-2-2026-04-21',
  'gpt-image-1.5',
  'gpt-image-1-mini',
  'chatgpt-image-latest',
] as const;
export type ImageModel = (typeof models)[number];
export function capabilities(model: ImageModel) {
  const modern = model.startsWith('gpt-image-2');
  const advanced = model.startsWith('gpt-image-2.5') || model.startsWith('gpt-image-2.6');
  return {
    customSize: modern,
    advanced,
    fidelity: model === 'gpt-image-1.5' || model === 'gpt-image-1-mini',
    highFidelity: model === 'gpt-image-1.5',
  };
}
export const formats = ['png', 'jpeg', 'webp', 'gif', 'svg'] as const;
export const mimeTypes = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
} as const;
export const standardSizes = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const;
