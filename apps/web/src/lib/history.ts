import { openDB, type DBSchema } from 'idb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import { settingsSchema, type Settings } from './contract';
import { mimeTypes, formats } from './models';

export interface Artwork {
  id: string;
  createdAt: number;
  settings: Settings;
  image: Blob;
  format: Settings['output_format'];
}
interface HistoryDB extends DBSchema {
  artworks: { key: string; value: Artwork; indexes: { createdAt: number } };
}
function db() {
  return openDB<HistoryDB>('gpt-image-studio', 1, {
    upgrade(database) {
      database.createObjectStore('artworks', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    },
  });
}
export async function saveArtwork(artwork: Artwork) {
  const database = await db();
  try {
    await database.put('artworks', artwork);
  } finally {
    database.close();
  }
}
export async function listArtworks(limit = 50) {
  const database = await db();
  try {
    const items: Artwork[] = [];
    let cursor = await database.transaction('artworks').store.index('createdAt').openCursor(null, 'prev');
    while (cursor && items.length < limit) {
      items.push(cursor.value);
      cursor = await cursor.continue();
    }
    return items;
  } finally {
    database.close();
  }
}
export async function deleteArtwork(id: string) {
  const database = await db();
  try {
    await database.delete('artworks', id);
  } finally {
    database.close();
  }
}
const MAX_BACKUP = 256 * 1024 * 1024;
const manifestSchema = z.object({
  version: z.literal(1),
  artworks: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
        createdAt: z.number().finite().nonnegative(),
        settings: settingsSchema,
        format: z.enum(formats),
        file: z.string().regex(/^images\/[a-zA-Z0-9-]+\.(png|jpeg|webp|gif|svg)$/),
      }),
    )
    .max(10000),
});
export async function encodeBackup(items: Artwork[]) {
  if (items.reduce((sum, item) => sum + item.image.size, 0) > MAX_BACKUP)
    throw new Error('历史记录超过 256 MB，请分批选择作品导出');
  const files: Record<string, Uint8Array> = {};
  const metadata = [];
  for (const { image, ...item } of items) {
    const file = `images/${item.id}.${item.format}`;
    files[file] = new Uint8Array(await image.arrayBuffer());
    metadata.push({ ...item, file });
  }
  files['manifest.json'] = strToU8(JSON.stringify({ version: 1, artworks: metadata }));
  return new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
export async function decodeBackup(blob: Blob): Promise<Artwork[]> {
  if (blob.size > MAX_BACKUP + 5 * 1024 * 1024) throw new Error('备份超过 256 MB');
  let total = 0;
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
    filter(file) {
      total += file.originalSize;
      if (total > MAX_BACKUP + 5 * 1024 * 1024) throw new Error('备份解压后超过大小限制');
      return (
        file.name === 'manifest.json' || /^images\/[a-zA-Z0-9-]+\.(png|jpeg|webp|gif|svg)$/.test(file.name)
      );
    },
  });
  if (!files['manifest.json'] || files['manifest.json'].length > 5 * 1024 * 1024)
    throw new Error('不是有效的历史备份');
  const manifest = manifestSchema.parse(JSON.parse(strFromU8(files['manifest.json'])));
  const ids = new Set<string>();
  return manifest.artworks.map(({ file, ...item }) => {
    if (!files[file]?.length || file !== `images/${item.id}.${item.format}` || ids.has(item.id))
      throw new Error('备份图片缺失或记录重复');
    ids.add(item.id);
    return {
      ...item,
      image: new Blob([files[file] as Uint8Array<ArrayBuffer>], { type: mimeTypes[item.format] }),
    };
  });
}
export async function importBackup(blob: Blob) {
  const items = await decodeBackup(blob);
  const database = await db();
  try {
    const tx = database.transaction('artworks', 'readwrite');
    await Promise.all([...items.map((item) => tx.store.put(item)), tx.done]);
  } finally {
    database.close();
  }
  return items.length;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
