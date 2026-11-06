import { createContext, useContext, type ReactNode } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { MAX_IMAGES_PER_REQUEST } from '../lib/contract';
import type { Settings } from '../lib/contract';
import { capabilities, models, standardSizes, type ImageModel } from '../lib/models';
import { LocalImage } from './image';
import { X, Plus, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { Button } from './ui/button';

const FieldLabel = createContext('');
const ControlsDisabled = createContext(false);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FieldLabel.Provider value={label}>
      <label className="field">
        <span>{label}</span>
        {children}
      </label>
    </FieldLabel.Provider>
  );
}
export function Select({
  value,
  onChange,
  values,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  values: readonly string[];
  label?: Record<string, string>;
}) {
  const accessibleLabel = useContext(FieldLabel);
  const disabled = useContext(ControlsDisabled);
  return (
    <BaseSelect.Root
      value={value}
      disabled={disabled}
      items={values.map((item) => ({ value: item, label: label?.[item] ?? item }))}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <BaseSelect.Trigger className="select-trigger" aria-label={accessibleLabel}>
        <BaseSelect.Value />
        <BaseSelect.Icon>
          <ChevronDown size={14} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="select-positioner" sideOffset={5} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="select-popup">
            <BaseSelect.List>
              {values.map((item) => (
                <BaseSelect.Item key={item} value={item} className="select-item">
                  <BaseSelect.ItemText>{label?.[item] ?? item}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator>
                    <Check size={14} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export function normalizeSettings(s: Settings): Settings {
  const result = { ...s, n: Math.min(s.n, MAX_IMAGES_PER_REQUEST) };
  const caps = capabilities(s.model);
  if (!caps.advanced) {
    delete result.complexity;
    if (['xhigh', 'max'].includes(result.quality)) result.quality = 'auto';
    if (['svg', 'gif'].includes(result.output_format)) result.output_format = 'png';
  }
  if (!caps.customSize && !standardSizes.some((size) => size === result.size)) result.size = '1024x1024';
  if (s.mode !== 'edit' || !caps.fidelity) delete result.input_fidelity;
  if (!caps.highFidelity && result.input_fidelity === 'high') result.input_fidelity = 'low';
  if (s.mode === 'edit' && result.output_format === 'svg') result.output_format = 'png';
  if (['svg', 'gif'].includes(result.output_format)) {
    result.stream = false;
    result.partial_images = 0;
  }
  if (result.output_format === 'svg') result.n = 1;
  else delete result.svg;
  if (result.output_format !== 'gif') {
    delete result.frame_count;
    delete result.frame_duration_ms;
  }
  if (!['jpeg', 'webp'].includes(result.output_format)) delete result.output_compression;
  if (!['png', 'webp', 'svg'].includes(result.output_format) && result.background === 'transparent')
    result.background = 'opaque';
  if (!result.stream) result.partial_images = 0;
  return result;
}
export function Controls({
  settings: s,
  disabled = false,
  onChange,
  previewFormats,
  files,
  setFiles,
  mask,
  setMask,
  markup,
  setMarkup,
}: {
  settings: Settings;
  disabled?: boolean;
  onChange: (next: Settings) => void;
  previewFormats: boolean;
  files: File[];
  setFiles: (files: File[]) => void;
  mask?: File;
  setMask: (file?: File) => void;
  markup?: File;
  setMarkup: (file?: File) => void;
}) {
  const update = (patch: Partial<Settings>) => onChange(normalizeSettings({ ...s, ...patch }));
  const caps = capabilities(s.model);
  const formatValues =
    previewFormats && caps.advanced
      ? ['png', 'jpeg', 'webp', 'gif', ...(s.mode === 'generate' ? ['svg'] : [])]
      : ['png', 'jpeg', 'webp'];
  const custom = !standardSizes.some((size) => size === s.size);
  const [width, height] = s.size.split('x');
  return (
    <ControlsDisabled.Provider value={disabled}>
      {s.mode === 'edit' && (
        <div className="references">
          <div className="field-caption">
            参考图 <span>{files.length} / 16</span>
          </div>
          <div className="reference-grid">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="reference">
                <LocalImage blob={file} alt={`参考图 ${index + 1}`} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`移除参考图 ${index + 1}`}
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                >
                  <X size={12} />
                </Button>
                <span>{index + 1}</span>
              </div>
            ))}
            {files.length < 16 && (
              <label className="add-reference">
                <Plus size={20} />
                <span>上传图片</span>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(e) => {
                    setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 16));
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}
      <div className="control-grid">
        <Field label="模型">
          <Select value={s.model} values={models} onChange={(v) => update({ model: v as ImageModel })} />
        </Field>
        <div className="field-pair">
          <Field label="画幅">
            <Select
              value={custom ? 'custom' : s.size}
              values={[...standardSizes, ...(caps.customSize ? ['custom'] : [])]}
              label={{
                auto: '自动',
                '1024x1024': '方形 · 1:1',
                '1536x1024': '横向 · 3:2',
                '1024x1536': '纵向 · 2:3',
                custom: '自定义尺寸',
              }}
              onChange={(v) => update({ size: v === 'custom' ? '1536x864' : v })}
            />
          </Field>
          <Field label="质量">
            <Select
              value={s.quality}
              values={['auto', 'low', 'medium', 'high', ...(caps.advanced ? ['xhigh', 'max'] : [])]}
              label={{ auto: '自动', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' }}
              onChange={(v) => update({ quality: v as Settings['quality'] })}
            />
          </Field>
        </div>
        {custom && (
          <div className="field-pair">
            <Field label="宽度（px）">
              <input
                type="number"
                step="16"
                value={width || ''}
                onChange={(e) => update({ size: `${e.target.value}x${height || '1024'}` })}
              />
            </Field>
            <Field label="高度（px）">
              <input
                type="number"
                step="16"
                value={height || ''}
                onChange={(e) => update({ size: `${width || '1024'}x${e.target.value}` })}
              />
            </Field>
          </div>
        )}
        <div className="field-pair">
          <Field label="图片数量">
            <Select
              value={String(s.n)}
              values={Array.from({ length: s.output_format === 'svg' ? 1 : MAX_IMAGES_PER_REQUEST }, (_, i) =>
                String(i + 1),
              )}
              onChange={(value) => update({ n: Number(value) })}
            />
          </Field>
          <Field label="格式">
            <Select
              value={s.output_format}
              values={formatValues}
              label={{ png: 'PNG', jpeg: 'JPEG', webp: 'WebP', gif: 'GIF · 预览', svg: 'SVG · 预览' }}
              onChange={(v) => update({ output_format: v as Settings['output_format'] })}
            />
          </Field>
        </div>
      </div>
      <details className="advanced">
        <summary>
          <SlidersHorizontal size={15} />
          高级设置
        </summary>
        <div className="advanced-body">
          <Field label="背景">
            <Select
              value={s.background}
              values={[
                'auto',
                'opaque',
                ...(['png', 'webp', 'svg'].includes(s.output_format) ? ['transparent'] : []),
              ]}
              label={{ auto: '自动', opaque: '不透明', transparent: '透明' }}
              onChange={(v) => update({ background: v as Settings['background'] })}
            />
          </Field>
          {['jpeg', 'webp'].includes(s.output_format) && (
            <Field label={`输出压缩质量 · ${s.output_compression ?? 100}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={s.output_compression ?? 100}
                onChange={(e) => update({ output_compression: Number(e.target.value) })}
              />
            </Field>
          )}
          {caps.advanced && (
            <Field label="构图复杂度">
              <Select
                value={s.complexity ?? 'default'}
                values={['default', 'low', 'medium', 'high']}
                label={{ default: '模型默认', low: '低', medium: '中', high: '高' }}
                onChange={(v) =>
                  update({ complexity: v === 'default' ? undefined : (v as Settings['complexity']) })
                }
              />
            </Field>
          )}
          <Field label="内容审核">
            <Select
              value={s.moderation}
              values={['auto', 'low']}
              label={{ auto: '标准', low: '较宽松' }}
              onChange={(v) => update({ moderation: v as Settings['moderation'] })}
            />
          </Field>
          {!['svg', 'gif'].includes(s.output_format) && (
            <>
              <label className="toggle-row">
                <span>流式预览</span>
                <input
                  type="checkbox"
                  checked={s.stream}
                  onChange={(e) =>
                    update({ stream: e.target.checked, partial_images: e.target.checked ? 1 : 0 })
                  }
                />
              </label>
              {s.stream && (
                <Field label="中间预览数量">
                  <Select
                    value={String(s.partial_images)}
                    values={['0', '1', '2', '3']}
                    onChange={(v) => update({ partial_images: Number(v) })}
                  />
                </Field>
              )}
            </>
          )}
          {s.output_format === 'gif' && (
            <div className="field-pair">
              <Field label="帧数">
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={s.frame_count ?? 9}
                  onChange={(e) => update({ frame_count: Number(e.target.value) })}
                />
              </Field>
              <Field label="每帧时长（ms）">
                <input
                  type="number"
                  min={20}
                  max={2000}
                  step={10}
                  value={s.frame_duration_ms ?? 200}
                  onChange={(e) => update({ frame_duration_ms: Number(e.target.value) })}
                />
              </Field>
            </div>
          )}
          {s.output_format === 'svg' && (
            <>
              <Field label="SVG 作者模型（可选）">
                <input
                  value={s.svg?.model ?? ''}
                  placeholder="使用默认模型"
                  onChange={(e) =>
                    update({ svg: e.target.value ? { ...s.svg, model: e.target.value } : undefined })
                  }
                />
              </Field>
              {s.svg && (
                <Field label="SVG 推理强度">
                  <Select
                    value={s.svg.reasoning?.effort ?? 'medium'}
                    values={['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']}
                    onChange={(v) =>
                      update({
                        svg: {
                          model: s.svg!.model,
                          reasoning: {
                            effort: v as NonNullable<NonNullable<Settings['svg']>['reasoning']>['effort'],
                          },
                        },
                      })
                    }
                  />
                </Field>
              )}
            </>
          )}
          {s.mode === 'edit' && (
            <>
              {caps.fidelity && (
                <Field label="输入保真度">
                  <Select
                    value={s.input_fidelity ?? 'low'}
                    values={caps.highFidelity ? ['low', 'high'] : ['low']}
                    label={{ low: '标准', high: '高' }}
                    onChange={(v) => update({ input_fidelity: v as Settings['input_fidelity'] })}
                  />
                </Field>
              )}
              {s.output_format !== 'gif' && (
                <Field label="遮罩 PNG（可选）">
                  <input
                    type="file"
                    accept="image/png"
                    onChange={(e) => {
                      setMask(e.target.files?.[0]);
                      setMarkup(undefined);
                    }}
                  />
                  {mask && (
                    <span className="file-note">
                      {mask.name}
                      <button type="button" onClick={() => setMask(undefined)}>
                        移除
                      </button>
                    </span>
                  )}
                </Field>
              )}
              {caps.advanced && (
                <Field label="标注 PNG（可选）">
                  <input
                    type="file"
                    accept="image/png"
                    onChange={(e) => {
                      setMarkup(e.target.files?.[0]);
                      setMask(undefined);
                    }}
                  />
                  {markup && (
                    <span className="file-note">
                      {markup.name}
                      <button type="button" onClick={() => setMarkup(undefined)}>
                        移除
                      </button>
                    </span>
                  )}
                </Field>
              )}
            </>
          )}
        </div>
      </details>
    </ControlsDisabled.Provider>
  );
}
