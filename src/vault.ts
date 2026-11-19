import { normalizePath, type App, type TFile } from "obsidian";
import { sanitizeFileBase } from "./text";

export interface SavedNoteRef {
  sourceId: string;
  docId: string;
  doi: string;
  url: string;
  path: string;
  file: TFile;
}

export function savedNoteRefs(app: App): SavedNoteRef[] {
  const refs: SavedNoteRef[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const front = app.metadataCache.getFileCache(file)?.frontmatter;
    refs.push({
      sourceId: typeof front?.source_id === "string" ? front.source_id : "",
      docId: typeof front?.doc_id === "string" ? front.doc_id : "",
      doi: typeof front?.doi === "string" ? front.doi : "",
      url: typeof front?.url === "string" ? front.url : "",
      path: file.path,
      file,
    });
  }
  return refs;
}

export function notesBySourceId(app: App): Map<string, TFile> {
  const map = new Map<string, TFile>();
  for (const file of app.vault.getMarkdownFiles()) {
    const sourceId = app.metadataCache.getFileCache(file)?.frontmatter?.source_id;
    if (typeof sourceId === "string" && sourceId) map.set(sourceId, file);
  }
  return map;
}

export interface NoteImage {
  filename: string;
  data: Uint8Array;
}

export const IMAGE_FOLDER = "첨부";

/** Point kordoc's `![image](image_001.png)` placeholders at the saved files as Obsidian embeds. */
export function linkImages(markdown: string, folder: string, names: ReadonlySet<string>): string {
  return markdown.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (full, dest: string) => {
    const name = dest.trim();
    return names.has(name) ? `![[${folder}/${name}]]` : full;
  });
}

async function ensureFolder(app: App, directory: string): Promise<void> {
  let current = "";
  for (const part of directory.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}

export async function createNote(app: App, folder: string, base: string, markdown: string, images: NoteImage[] = []): Promise<TFile> {
  const directory = folder.replace(/^\/+|\/+$/g, "");
  if (directory) await ensureFolder(app, directory);
  const stem = sanitizeFileBase(base);
  let name = stem;
  let path = normalizePath(`${directory ? `${directory}/` : ""}${name}.md`);
  let index = 2;
  while (app.vault.getAbstractFileByPath(path)) {
    name = `${stem} (${index})`;
    path = normalizePath(`${directory ? `${directory}/` : ""}${name}.md`);
    index += 1;
  }
  let text = markdown;
  if (images.length) {
    const imageDir = normalizePath(`${directory ? `${directory}/` : ""}${IMAGE_FOLDER}/${name}`);
    await ensureFolder(app, imageDir);
    const written = new Set<string>();
    for (const image of images) {
      const file = sanitizeFileBase(image.filename);
      const target = normalizePath(`${imageDir}/${file}`);
      const bytes = image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength) as ArrayBuffer;
      if (!app.vault.getAbstractFileByPath(target)) await app.vault.createBinary(target, bytes);
      if (file === image.filename) written.add(image.filename);
    }
    text = linkImages(markdown, imageDir, written);
  }
  return app.vault.create(path, text);
}
