import { describe, it, expect } from 'vite-plus/test';
import { settingsSchema, generationSettingsSchema, defaultSettings } from './contract';
import { models } from './models';
import { normalizeSettings, applySettingsPatch, compatibleGuides } from '../components/controls';

describe('image parameter contract', () => {
  const valid = { ...defaultSettings, prompt: 'A blue ceramic vase' };
  it('accepts a generation request with defaults', () => expect(settingsSchema.parse(valid).n).toBe(1));
  it.each([
    { background: 'transparent', output_format: 'jpeg' },
    { output_format: 'png', output_compression: 80 },
    { stream: false, partial_images: 1 },
    { output_format: 'svg', n: 2, stream: false, partial_images: 0 },
    { output_format: 'gif', stream: true },
    { output_format: 'svg', stream: false, partial_images: 0, background: 'transparent' },
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

describe('site generation limit', () => {
  it('accepts three images and rejects four for both modes', () => {
    for (const mode of ['generate', 'edit']) {
      const settings = { ...defaultSettings, prompt: 'An orange cat', mode };
      expect(generationSettingsSchema.safeParse({ ...settings, n: 3 }).success).toBe(true);
      expect(generationSettingsSchema.safeParse({ ...settings, n: 4 }).success).toBe(false);
    }
  });
  it('still accepts historical settings from batches larger than three', () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, prompt: 'An old image', n: 10 }).success).toBe(
      true,
    );
  });
});

describe('GIF model compatibility', () => {
  const gif = {
    ...defaultSettings,
    prompt: 'A waving cat',
    output_format: 'gif' as const,
    stream: false,
    partial_images: 0,
    frame_count: 9,
    frame_duration_ms: 200,
  };
  it.each(models)('only accepts GIF requests on 2.6: %s', (model) => {
    expect(generationSettingsSchema.safeParse({ ...gif, model }).success).toBe(
      model.startsWith('gpt-image-2.6-'),
    );
  });
  it('accepts small GIF frames without relaxing still-image sizes', () => {
    expect(generationSettingsSchema.safeParse({ ...gif, size: '512x512' }).success).toBe(true);
    expect(generationSettingsSchema.safeParse({ ...gif, size: '513x512' }).success).toBe(false);
    expect(
      generationSettingsSchema.safeParse({ ...defaultSettings, prompt: 'A cat', size: '512x512' }).success,
    ).toBe(false);
  });
  it('clears GIF settings when switching to 2.5', () => {
    const next = normalizeSettings({ ...gif, model: 'gpt-image-2.5-flare' });
    expect(next.output_format).toBe('png');
    expect(next.frame_count).toBeUndefined();
    expect(next.frame_duration_ms).toBeUndefined();
    expect(generationSettingsSchema.safeParse(next).success).toBe(true);
  });
  it('disables incompatible options when selecting GIF', () => {
    const next = normalizeSettings({
      ...gif,
      stream: true,
      partial_images: 2,
      background: 'transparent',
      output_compression: 80,
    });
    expect(next.stream).toBe(false);
    expect(next.partial_images).toBe(0);
    expect(next.background).toBe('opaque');
    expect(next.output_compression).toBeUndefined();
    expect(generationSettingsSchema.safeParse(next).success).toBe(true);
  });
});

describe('model transitions', () => {
  it.each(models)('normalizes advanced settings when switching to %s', (model) => {
    const next = normalizeSettings({
      ...defaultSettings,
      prompt: 'A cat',
      model,
      mode: 'edit',
      size: '512x512',
      output_format: 'gif',
      frame_count: 9,
      frame_duration_ms: 200,
      quality: 'max',
      complexity: 'high',
      input_fidelity: 'high',
      background: 'transparent',
      output_compression: 80,
    });
    expect(generationSettingsSchema.safeParse(next).success).toBe(true);
  });
});

it('uses automatic GIF dimensions without resetting unrelated format changes', () => {
  const current = { ...defaultSettings, prompt: 'A cat', size: '1536x1024' };
  expect(applySettingsPatch(current, { output_format: 'jpeg' }).size).toBe('1536x1024');
  const gif = applySettingsPatch(current, { output_format: 'gif' });
  expect(gif.size).toBe('auto');
  expect(applySettingsPatch({ ...gif, size: '512x512' }, { output_format: 'png' }).size).toBe('auto');
});
it('removes hidden edit guides when changing modes, models or formats', () => {
  const mask = new File(['mask'], 'mask.png');
  const markup = new File(['markup'], 'markup.png');
  expect(compatibleGuides(defaultSettings, { mask, markup })).toEqual({ mask: undefined, markup: undefined });
  expect(compatibleGuides({ ...defaultSettings, mode: 'edit', output_format: 'gif' }, { mask })).toEqual({
    mask: undefined,
    markup: undefined,
  });
  expect(compatibleGuides({ ...defaultSettings, mode: 'edit', model: 'gpt-image-1.5' }, { markup })).toEqual({
    mask: undefined,
    markup: undefined,
  });
  expect(compatibleGuides({ ...defaultSettings, mode: 'edit' }, { mask }).mask).toBe(mask);
  expect(compatibleGuides({ ...defaultSettings, mode: 'edit' }, { markup }).markup).toBe(markup);
});
