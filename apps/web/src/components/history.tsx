import { Dialog } from '@base-ui/react/dialog';
import { useCallback, useEffect, useState } from 'react';
import { Download, Upload, X, Trash2 } from 'lucide-react';
import {
  deleteArtwork,
  downloadBlob,
  encodeBackup,
  importBackup,
  listArtworks,
  type Artwork,
} from '../lib/history';
import { Button } from './ui/button';
import { LocalImage } from './image';

export function History({
  open,
  onOpenChange,
  onSelect,
  revision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (art: Artwork) => void;
  revision: number;
}) {
  const [items, setItems] = useState<Artwork[]>([]);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const refresh = useCallback(
    () =>
      listArtworks(limit)
        .then(setItems)
        .catch(() => setError('无法读取本地历史，请检查浏览器存储权限')),
    [limit],
  );
  useEffect(() => {
    if (open) void refresh();
  }, [open, revision, refresh]);
  const exportItems = async () => {
    try {
      const entries = selected.size ? items.filter((item) => selected.has(item.id)) : items;
      downloadBlob(await encodeBackup(entries), 'gpt-image-studio-history.zip');
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="drawer-backdrop" />
        <Dialog.Popup className="history-drawer">
          <div className="drawer-heading">
            <Dialog.Title>历史记录</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭历史" />}>
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            保存在当前浏览器。清理网站数据前，请先导出备份。
          </Dialog.Description>
          <div className="history-toolbar">
            <Button variant="outline" onClick={() => void exportItems()} disabled={!items.length}>
              <Download size={15} />
              {selected.size ? `导出所选 ${selected.size} 张` : '导出已加载记录'}
            </Button>
            <label className="button button-ghost">
              <Upload size={15} />
              导入
              <input
                type="file"
                accept=".zip"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void importBackup(file)
                    .then(() => {
                      setError('');
                      return refresh();
                    })
                    .catch(() => setError('导入失败，请确认备份完整且不超过 256 MB'));
                  event.target.value = '';
                }}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {!items.length && <p className="history-empty">生成的图片会出现在这里。</p>}
          <div className="history-grid">
            {items.map((item) => (
              <article key={item.id} className="history-item">
                <button
                  className="history-image"
                  onClick={() => {
                    onSelect(item);
                    onOpenChange(false);
                  }}
                  aria-label={`查看：${item.settings.prompt}`}
                >
                  <LocalImage blob={item.image} alt={item.settings.prompt} />
                </button>
                <div className="history-meta">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    aria-label={`选择：${item.settings.prompt}`}
                    onChange={(e) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                  />
                  <span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`删除：${item.settings.prompt}`}
                    onClick={() =>
                      void deleteArtwork(item.id)
                        .then(refresh)
                        .catch(() => setError('删除失败，请重试'))
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <p>{item.settings.prompt}</p>
              </article>
            ))}
          </div>
          {items.length >= limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + 50)}>
              加载更多
            </Button>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
