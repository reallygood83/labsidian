/** Shared string helpers. No network, no Obsidian. */

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function stripTags(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  const noTags = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Publication dates from the agency pages: 2026.10.26, 2026-11-17, 20261026. */
export function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  if (digits.length === 4) return digits;
  return "";
}

export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function localStamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${localIsoDate(date)}T${hours}:${minutes}`;
}

export function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function sanitizeFileBase(name: string): string {
  const cleaned = [...name]
    .map((char) => ((char.codePointAt(0) ?? 0) < 32 || "\\/:*?\"<>|#^[]".includes(char) ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const sliced = [...cleaned].slice(0, 80).join("").trim();
  return sliced || "연구자료";
}

export function uniqueAuthors(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function splitPeople(value: string): string[] {
  return uniqueAuthors(value.split(/[,·/]| {2,}|\s+/).map((part) => part.trim()));
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}
