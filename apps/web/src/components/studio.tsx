import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Download,
  History as HistoryIcon,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  Square,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import { Controls, normalizeSettings, compatibleGuides } from './controls';
import { History } from './history';
import { LocalImage } from './image';
import { useStudio } from '../lib/store';
import { defaultSettings, generationSettingsSchema, outputEventSchema, type Settings } from '../lib/contract';
import { client } from '../lib/rpc';
import { mimeTypes } from '../lib/models';
import { saveArtwork, downloadBlob, type Artwork } from '../lib/history';
import { readLines } from '../lib/read-lines';

function imageBlob(b64: string, format: Settings['output_format']) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeTypes[format] });
}
export function Studio() {
  const { settings, restore, update } = useStudio();
  const [config, setConfig] = useState<Awaited<ReturnType<typeof client.config>>>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [mask, setMask] = useState<File>();
  const [markup, setMarkup] = useState<File>();
  const [results, setResults] = useState<Artwork[]>([]);
  const [selected, setSelected] = useState<Artwork>();
  const [preview, setPreview] = useState<Blob>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [unsaved, setUnsaved] = useState<Artwork[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    void client
      .config()
      .then(setConfig)
      .catch(() => setError('无法连接服务，请刷新页面重试'));
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [busy]);
  useEffect(() => {
    if (!busy && !unsaved.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, unsaved.length]);
  const persist = async (art: Artwork) => {
    try {
      await saveArtwork(art);
      setRevision((v) => v + 1);
    } catch {
      setUnsaved((items) => [...items.filter((i) => i.id !== art.id), art]);
      setNotice('本地保存失败，图片仍可下载。请释放浏览器空间后重试保存。');
    }
  };
  const generate = async () => {
    if (controller.current || busy || !config?.configured || config.generationPauseReason) return;
    const parsed = generationSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查参数');
      return;
    }
    if (settings.mode === 'edit' && !files.length) {
      setError('请先上传参考图');
      return;
    }
    const guides = compatibleGuides(parsed.data, { mask, markup });
    const uploads = [
      ...files,
      ...(guides.mask ? [guides.mask] : []),
      ...(guides.markup ? [guides.markup] : []),
    ];
    if (
      uploads.some((file) => file.size > 10 * 1024 * 1024) ||
      uploads.reduce((n, f) => n + f.size, 0) > 23 * 1024 * 1024
    ) {
      setError('单张参考图不能超过 10 MB，总上传大小请控制在 23 MB 内');
      return;
    }
    if (unsaved.length) {
      setError('还有图片未保存，请先重试保存，或下载后确认继续');
      return;
    }
    const snapshot = parsed.data;
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    setNotice('');
    setResults([]);
    setSelected(undefined);
    setPreview(undefined);
    setElapsed(0);
    setBusy(true);
    const form = new FormData();
    form.set('payload', JSON.stringify({ settings: snapshot, requestId: crypto.randomUUID() }));
    if (snapshot.mode === 'edit') {
      files.forEach((file) => form.append('image', file));
      if (guides.mask) form.set('mask', guides.mask);
      if (guides.markup) form.set('markup', guides.markup);
    }
    try {
      const response = await fetch('/api/generate', { method: 'POST', body: form, signal: abort.signal });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? '生成失败，请稍后再试');
      }
      if (!response.body) throw new Error('服务未返回结果');
      let completed = false;
      const consume = async (line: string) => {
        if (!line.trim()) return;
        const event = outputEventSchema.parse(JSON.parse(line));
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'done') {
          // Local response-consumption state, never shared between renders.
          // oxlint-disable-next-line react/immutability
          completed = true;
          return;
        }
        const blob = imageBlob(event.b64, event.format);
        if (event.type === 'preview') {
          setPreview(blob);
          return;
        }
        const art: Artwork = {
          id: event.id,
          image: blob,
          format: event.format,
          settings: snapshot,
          createdAt: Date.now(),
        };
        setResults((items) => [...items, art]);
        setSelected(art);
        setPreview(undefined);
        if (!event.archived) setNotice('图片已生成，但服务端留档失败；请保留本地副本。');
        await persist(art);
      };
      for await (const line of readLines(response.body, 24 * 1024 * 1024)) await consume(line);
      if (!completed) throw new Error('连接已中断，已收到的图片仍可下载。上游可能仍在处理，请勿连续提交。');
    } catch (e) {
      setError(
        abort.signal.aborted
          ? '已停止等待。上游可能仍在处理，已收到的图片可以下载。'
          : e instanceof Error
            ? e.message
            : '生成失败',
      );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  const sendToEdit = (art: Artwork) => {
    restore(
      normalizeSettings({
        ...art.settings,
        mode: 'edit',
        output_format: art.format === 'svg' || art.format === 'gif' ? 'png' : art.format,
      }),
    );
    setFiles([new File([art.image], `reference.${art.format}`, { type: art.image.type })]);
    setMask(undefined);
    setMarkup(undefined);
    document.getElementById('prompt')?.focus();
  };
  const startNew = () => {
    if (busy) return;
    if (unsaved.length) {
      setError('还有图片未保存，请先重试保存，或下载后确认继续');
      return;
    }
    restore({ ...defaultSettings });
    setFiles([]);
    setMask(undefined);
    setMarkup(undefined);
    setResults([]);
    setSelected(undefined);
    setPreview(undefined);
    setError('');
    setNotice('');
    document.getElementById('prompt')?.focus();
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-links">
            <h1>
              <Link to="/" className="wordmark">
                Image Studio<span>GPT</span>
              </Link>
            </h1>
            <a
              href="https://github.com/Cansiny0320/gpt-image-studio"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
              title="GitHub 仓库"
              className="github-link"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
                <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.105.77-.244.77-.542 0-.267-.01-.975-.015-1.914-3.13.68-3.79-1.509-3.79-1.509-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.725 1.16 1.725 1.16 1.005 1.723 2.636 1.225 3.278.937.103-.728.393-1.225.715-1.507-2.499-.284-5.126-1.25-5.126-5.563 0-1.229.44-2.233 1.16-3.02-.116-.284-.503-1.429.11-2.978 0 0 .945-.302 3.094 1.154A10.79 10.79 0 0 1 12 6.191a10.8 10.8 0 0 1 2.818.379c2.148-1.456 3.091-1.154 3.091-1.154.615 1.549.228 2.694.112 2.978.722.787 1.159 1.791 1.159 3.02 0 4.324-2.631 5.276-5.138 5.555.404.349.765 1.039.765 2.094 0 1.512-.014 2.732-.014 3.103 0 .301.203.653.774.542A11.25 11.25 0 0 0 12 .75Z" />
              </svg>
            </a>
          </div>
          <p className="project-note">
            免费开源，请勿付费购买 · <Link to="/sponsor">欢迎赞赏</Link>
          </p>
        </div>
        <nav aria-label="主导航">
          <Link to="/sponsor" className="nav-link">
            赞赏
            <ArrowUpRight size={14} />
          </Link>
          <Button variant="ghost" disabled={busy} onClick={() => setHistoryOpen(true)}>
            <HistoryIcon size={17} />
            历史记录
          </Button>
        </nav>
      </header>
      <main className="workbench">
        <section className="composer" aria-label="生成设置">
          <fieldset className="mode-switch" aria-label="创作模式" disabled={busy}>
            {(['generate', 'edit'] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={settings.mode === mode}
                onClick={() => {
                  restore(normalizeSettings({ ...settings, mode }));
                  setMask(undefined);
                  setMarkup(undefined);
                }}
              >
                {mode === 'generate' ? '文生图' : '图片编辑'}
              </button>
            ))}
          </fieldset>
          <fieldset disabled={busy}>
            <label className="prompt-label" htmlFor="prompt">
              {settings.mode === 'edit' ? '描述你想修改的内容' : '描述你想生成的画面'}
            </label>
            <textarea
              id="prompt"
              value={settings.prompt}
              maxLength={32000}
              placeholder="主体、场景、光线、风格，以及你在意的细节…"
              onChange={(e) => update({ prompt: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void generate();
                }
              }}
            />
            <Controls
              settings={settings}
              disabled={busy}
              onChange={restore}
              previewFormats={config?.previewFormats ?? false}
              files={files}
              setFiles={setFiles}
              mask={mask}
              setMask={setMask}
              markup={markup}
              setMarkup={setMarkup}
            />
          </fieldset>
          <div className="generate-area">
            {config?.generationPauseReason ? (
              <output className="error">{config.generationPauseReason}</output>
            ) : config && !config.configured ? (
              <p className="error">生图服务尚未配置完成，请联系站点维护者。</p>
            ) : null}
            {error && (
              <div role="alert" className="error">
                {error}
                <button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="generate-buttons">
              <Button
                onClick={() => void generate()}
                disabled={
                  busy || !config?.configured || !!config.generationPauseReason || !settings.prompt.trim()
                }
                className="generate-button"
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}
                {busy ? `生成中 · ${elapsed}s` : '生成图片'}
              </Button>
              {busy && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="停止等待"
                  onClick={() => controller.current?.abort()}
                >
                  <Square size={14} />
                </Button>
              )}
            </div>
            <Link to="/guide" className="nav-link mt-2 py-1">
              使用指南
            </Link>
          </div>
        </section>
        <section className="output" aria-label="生成结果">
          <div className="output-toolbar">
            <span>
              {selected
                ? `${selected.settings.size === 'auto' ? '自动尺寸' : selected.settings.size.replace('x', ' × ')} · ${selected.format.toUpperCase()}`
                : busy
                  ? '正在创作'
                  : '预览'}
            </span>
            <div>
              <Button variant="ghost" disabled={busy} onClick={startNew}>
                <Plus size={15} />
                新建
              </Button>
              {selected && (
                <>
                  <Button
                    variant="ghost"
                    disabled={busy || ['svg', 'gif'].includes(selected.format)}
                    onClick={() => sendToEdit(selected)}
                  >
                    <Pencil size={15} />
                    继续编辑
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => downloadBlob(selected.image, `image-${selected.id}.${selected.format}`)}
                  >
                    <Download size={15} />
                    下载
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className={`canvas ${selected || preview ? 'has-image' : ''}`}>
            {preview ? (
              <LocalImage blob={preview} alt="生成中的临时预览" />
            ) : selected ? (
              <LocalImage blob={selected.image} alt={selected.settings.prompt} />
            ) : (
              <div className="empty-canvas">
                {busy ? (
                  <LoaderCircle className="spin" size={30} />
                ) : (
                  <ImagePlus size={30} strokeWidth={1.2} />
                )}
                <p>{busy ? '正在等待图像生成' : '从一个画面开始'}</p>
                <span>{busy ? '结果会自动出现在这里' : '在左侧输入提示词，生成你的第一张图片'}</span>
              </div>
            )}
            {preview && <span className="preview-label">生成中</span>}
          </div>
          {results.length > 1 && (
            <div className="result-strip">
              {results.map((art, i) => (
                <button
                  key={art.id}
                  aria-label={`查看第 ${i + 1} 张`}
                  aria-pressed={selected?.id === art.id}
                  onClick={() => setSelected(art)}
                >
                  <LocalImage blob={art.image} alt={`第 ${i + 1} 张`} />
                </button>
              ))}
            </div>
          )}
          {notice && (
            <output className="notice">
              {notice}
              {unsaved.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const pending = unsaved;
                      setUnsaved([]);
                      setNotice('');
                      void (async () => {
                        for (const art of pending) await persist(art);
                      })();
                    }}
                  >
                    重试保存
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      for (const art of unsaved) downloadBlob(art.image, `image-${art.id}.${art.format}`);
                    }}
                  >
                    下载未保存图片
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setUnsaved([]);
                      setNotice('已解除暂存保护；开始下一次生成会替换当前结果。');
                    }}
                  >
                    已下载，允许继续生成
                  </Button>
                </>
              )}
            </output>
          )}
        </section>
      </main>
      <History
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        revision={revision}
        onSelect={(art) => {
          setSelected(art);
          setPreview(undefined);
          restore(normalizeSettings(art.settings));
          setResults([]);
          setFiles([]);
          setMask(undefined);
          setMarkup(undefined);
          setError('');
        }}
      />
    </div>
  );
}
