import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { Buffer } from 'node:buffer';
import { images, requests } from './schema';
import { mimeTypes } from '../lib/models';
import type { Settings } from '../lib/contract';
import { PublicError } from './errors';

export interface Archive {
  reserve(id: string, settings: Settings): Promise<boolean>;
  saveReference(id: string, index: number, file: File): Promise<void>;
  save(id: string, index: number, settings: Settings, b64: string): Promise<string>;
  finish(id: string, status: string): Promise<void>;
}
export function createArchive(env: Pick<Env, 'DB' | 'IMAGES'>): Archive {
  const db = drizzle(env.DB);
  return {
    async reserve(id, settings) {
      const { prompt, ...selectedSettings } = settings;
      const rows = await db
        .insert(requests)
        .values({ id, createdAt: Date.now(), status: 'started', prompt, settings: selectedSettings })
        .onConflictDoNothing()
        .returning({ id: requests.id });
      return rows.length === 1;
    },
    async saveReference(requestId, index, file) {
      const position = String(index + 1).padStart(2, '0');
      const extension = file.type.slice('image/'.length);
      await env.IMAGES.put(`references/${requestId}/${position}.${extension}`, file, {
        httpMetadata: { contentType: file.type },
      });
    },
    async save(requestId, index, settings, b64) {
      const id = `${requestId}-${index}`;
      const objectKey = `${id}.${settings.output_format}`;
      if (!b64 || b64.length > 19 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64))
        throw new PublicError('返回的图片数据无效', 502);
      const bytes = Buffer.from(b64, 'base64');
      await env.IMAGES.put(objectKey, bytes, {
        httpMetadata: { contentType: mimeTypes[settings.output_format] },
      });
      try {
        await db.insert(images).values({
          id,
          requestId,
          objectKey,
          mime: mimeTypes[settings.output_format],
          bytes: bytes.length,
        });
      } catch (error) {
        // Do not leave an unassociated image in the private archive on metadata failure.
        await env.IMAGES.delete(objectKey).catch(() => {});
        throw error;
      }
      return id;
    },
    async finish(id, status) {
      await db.update(requests).set({ status }).where(eq(requests.id, id));
    },
  };
}
