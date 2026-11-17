import { collapseWs, decodeEntities } from "../text";

export function hiddenInput(html: string, id: string): string {
  const tag = new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i").exec(html)?.[0] ?? "";
  const value = /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
  return decodeEntities(value);
}

export function rows(html: string): string[] {
  return html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
}

export function cellTexts(row: string): string[] {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => collapseWs(decodeEntities(match[1].replace(/<[^>]+>/g, " "))));
}
