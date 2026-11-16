import { normalizePath, type App, type TFile } from "obsidian";
import { sanitizeFileBase } from "./text";

export interface SavedNoteRef {
  sourceId: string;
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

export async function createNote(app: App, folder: string, base: string, markdown: string): Promise<TFile> {
  const directory = folder.replace(/^\/+|\/+$/g, "");
  if (directory && !app.vault.getAbstractFileByPath(directory)) {
    await app.vault.createFolder(directory);
  }
  const stem = sanitizeFileBase(base);
  let path = normalizePath(`${directory ? `${directory}/` : ""}${stem}.md`);
  let index = 2;
  while (app.vault.getAbstractFileByPath(path)) {
    path = normalizePath(`${directory ? `${directory}/` : ""}${stem} (${index}).md`);
    index += 1;
  }
  return app.vault.create(path, markdown);
}
