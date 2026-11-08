import { Buffer } from 'node:buffer';
import { ImageResponseError, unreadableImageMessage } from './errors';

export const MAX_BASE64_CHARS = 19 * 1024 * 1024;
const BLOCK_CHARS = 16 * 1024;

export type ImagePayload = { chunks: readonly Buffer[]; byteLength: number };

export function invalidImagePayload() {
  return new ImageResponseError(unreadableImageMessage, { reason: 'invalid_image_payload' });
}

export class ImageDecoder {
  private chunks: Buffer[] = [];
  private pending = '';
  private characters = 0;
  private padding = 0;
  private byteLength = 0;

  append(text: string) {
    this.characters += text.length;
    if (this.characters > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
      throw invalidImagePayload();
    const dataEnd = text.indexOf('=');
    if (this.padding && (dataEnd === -1 ? text.length > 0 : dataEnd > 0)) throw invalidImagePayload();
    if (dataEnd !== -1) this.padding += text.length - dataEnd;
    if (this.padding > 2) throw invalidImagePayload();

    this.pending += text;
    // Keep the last quartet for padding validation. All earlier blocks decode to multiples of 3 bytes.
    while (this.pending.length >= BLOCK_CHARS + 4) {
      this.decode(this.pending.slice(0, BLOCK_CHARS));
      this.pending = this.pending.slice(BLOCK_CHARS);
    }
  }

  finish(): ImagePayload {
    const dataCharacters = this.characters - this.padding;
    if (
      !dataCharacters ||
      dataCharacters % 4 === 1 ||
      (this.padding > 0 && (this.characters % 4 !== 0 || (dataCharacters % 4) + this.padding !== 4))
    )
      throw invalidImagePayload();
    this.decode(this.pending);
    return { chunks: this.chunks, byteLength: this.byteLength };
  }

  private decode(text: string) {
    const bytes = Buffer.from(text, 'base64');
    this.chunks.push(bytes);
    this.byteLength += bytes.length;
  }
}
