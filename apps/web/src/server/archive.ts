import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { images, requests } from './schema';
import { mimeTypes } from '../lib/models';
import type { Settings } from '../lib/contract';
import type { ImagePayload } from './image-payload';

export interface Archive {
  reserve(id: string, settings: Settings): Promise<boolean>;
  saveReference(id: string, index: number, file: File): Promise<void>;
  save(id: string, index: number, settings: Settings, image: ImagePayload): Promise<string>;
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
    async save(requestId, index, settings, image) {
      const id = `${requestId}-${index}`;
      const objectKey = `${id}.${settings.output_format}`;
      const { readable, writable } = new FixedLengthStream(image.byteLength);
      const stop = new AbortController();
      let offset = 0;
      const source = new ReadableStream<Uint8Array>({
        pull(sink) {
          if (offset < image.chunks.length) sink.enqueue(image.chunks[offset++]);
          else sink.close();
        },
      });
      const write = source.pipeTo(writable, { signal: stop.signal });
      try {
        await Promise.all([
          write,
          env.IMAGES.put(objectKey, readable, {
            httpMetadata: { contentType: mimeTypes[settings.output_format] },
          }),
        ]);
      } catch (error) {
        stop.abort(error);
        // A put can fail before it reads anything, leaving the writer blocked on backpressure.
        if (!readable.locked) await readable.cancel(error).catch(() => {});
        await write.catch(() => {});
        throw error;
      }
      try {
        await db.insert(images).values({
          id,
          requestId,
          objectKey,
          mime: mimeTypes[settings.output_format],
          bytes: image.byteLength,
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
