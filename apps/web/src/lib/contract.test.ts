import { describe, it, expect } from 'vite-plus/test';
import { settingsSchema, defaultSettings } from './contract';

describe('image parameter contract', () => {
  const valid = { ...defaultSettings, prompt: 'A blue ceramic vase' };
  it('accepts a generation request with defaults', () => expect(settingsSchema.parse(valid).n).toBe(1));
  it.each([
    { background: 'transparent', output_format: 'jpeg' },
    { output_format: 'png', output_compression: 80 },
    { stream: false, partial_images: 1 },
    { output_format: 'svg', n: 2, stream: false, partial_images: 0 },
    { output_format: 'gif', stream: true },
    { size: '1025x1024' },
    { size: '4096x4096' },
    { size: '16x16' },
    { size: '3072x768' },
    { input_fidelity: 'high' },
    { model: 'gpt-image-1-mini', quality: 'max' },
    { frame_count: 8 },
    { prompt: ' ' },
    { n: 11 },
    { api_key: 'should never be accepted' },
  ])('rejects incompatible fields: %j', (fields) =>
    expect(settingsSchema.safeParse({ ...valid, ...fields }).success).toBe(false),
  );
  it('accepts custom sizes for modern models', () =>
    expect(settingsSchema.safeParse({ ...valid, size: '1536x864' }).success).toBe(true));
  it('accepts a static SVG with author options', () =>
    expect(
      settingsSchema.safeParse({
        ...valid,
        output_format: 'svg',
        stream: false,
        partial_images: 0,
        svg: { model: 'gpt-6', reasoning: { effort: 'high' } },
      }).success,
    ).toBe(true));
  it('does not allow SVG edits', () =>
    expect(
      settingsSchema.safeParse({
        ...valid,
        mode: 'edit',
        output_format: 'svg',
        stream: false,
        partial_images: 0,
      }).success,
    ).toBe(false));
});
