import { decodeEntities } from "../text";

export function xmlTexts(xml: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => decodeEntities((match[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
}

export function xmlText(xml: string, tag: string): string {
  return xmlTexts(xml, tag)[0] ?? "";
}
