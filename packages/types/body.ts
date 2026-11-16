/** How a note body is stored in Firestore. A document must stay under 1MiB. */

export const INLINE_BODY_BYTES = 600_000;
export const CHUNK_BYTES = 700_000;
export const LOCKED_CHUNK_BYTES = 650_000;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function splitBody(body: string, limit = CHUNK_BYTES): string[] {
  if (!body) return [];
  if (utf8Bytes(body) <= limit) return [body];
  const chunks: string[] = [];
  let current = "";
  let size = 0;
  for (const char of body) {
    const bytes = utf8Bytes(char);
    if (current && size + bytes > limit) {
      chunks.push(current);
      current = char;
      size = bytes;
      continue;
    }
    current += char;
    size += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function placeBody(body: string, chunkBytes = CHUNK_BYTES): { inline: string; chunks: string[] } {
  if (utf8Bytes(body) <= INLINE_BODY_BYTES) return { inline: body, chunks: [] };
  return { inline: "", chunks: splitBody(body, chunkBytes) };
}

export function stitchBody(inline: string, chunks: readonly { index: number; text: string }[]): string {
  if (!chunks.length) return inline;
  return [...chunks].sort((a, b) => a.index - b.index).map((chunk) => chunk.text).join("");
}
