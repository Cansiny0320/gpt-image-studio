import 'fake-indexeddb/auto';
import { expect, it } from 'vite-plus/test';
import { encodeBackup, decodeBackup, saveArtwork, listArtworks, deleteArtwork } from './history';
import { defaultSettings } from './contract';
it('roundtrips prompt, settings and exact binary without server reads', async () => {
  const item = {
    id: crypto.randomUUID(),
    createdAt: 1,
    settings: { ...defaultSettings, prompt: '玻璃花瓶' },
    format: 'png' as const,
    image: new Blob([new Uint8Array([0, 255, 23, 42])], { type: 'image/png' }),
  };
  const [restored] = await decodeBackup(await encodeBackup([item]));
  expect(restored.settings).toEqual(item.settings);
  expect(new Uint8Array(await restored.image.arrayBuffer())).toEqual(new Uint8Array([0, 255, 23, 42]));
  await saveArtwork(restored);
  expect((await listArtworks())[0].id).toBe(item.id);
  await deleteArtwork(item.id);
  expect(await listArtworks()).toEqual([]);
});
it('rejects an unrelated file instead of partially importing', async () => {
  await expect(decodeBackup(new Blob(['not a zip']))).rejects.toThrow();
});
