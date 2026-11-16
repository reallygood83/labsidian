import { stitchBody } from "../../packages/types/body";
import type { ResearchNote } from "../../packages/types/research-note";

type FsValue =
  | { stringValue?: string }
  | { integerValue?: string }
  | { booleanValue?: boolean }
  | { timestampValue?: string }
  | { arrayValue?: { values?: { stringValue?: string }[] } };

interface FsDoc {
  fields?: Record<string, FsValue>;
}

function str(fields: Record<string, FsValue>, key: string): string {
  const value = fields[key];
  if (!value) return "";
  if ("stringValue" in value && value.stringValue) return value.stringValue;
  if ("timestampValue" in value && value.timestampValue) return value.timestampValue;
  return "";
}

function list(fields: Record<string, FsValue>, key: string): string[] {
  const value = fields[key];
  if (!value || !("arrayValue" in value)) return [];
  return (value.arrayValue?.values ?? []).map((item) => item.stringValue ?? "").filter(Boolean);
}

function num(fields: Record<string, FsValue>, key: string): number {
  const value = fields[key];
  return value && "integerValue" in value && value.integerValue ? Number(value.integerValue) : 0;
}

export function noteFromDoc(doc: FsDoc): ResearchNote | null {
  const fields = doc.fields ?? {};
  const sourceId = str(fields, "source_id");
  if (!sourceId) return null;
  return {
    title: str(fields, "title"),
    series: str(fields, "series"),
    source: str(fields, "source"),
    source_id: sourceId,
    team_id: str(fields, "team_id"),
    type: str(fields, "type"),
    publisher: str(fields, "publisher"),
    author: list(fields, "author"),
    published: str(fields, "published"),
    url: str(fields, "url"),
    pdf_url: str(fields, "pdf_url"),
    query: str(fields, "query"),
    keywords: list(fields, "keywords"),
    collected: str(fields, "collected"),
    converter: str(fields, "converter"),
    convert_warnings: num(fields, "convert_warnings"),
    summary_model: str(fields, "summary_model"),
    team_shared: true,
    tags: list(fields, "tags"),
    summary: str(fields, "summary"),
    body: str(fields, "body"),
    excerpt: str(fields, "excerpt"),
    owner_email: str(fields, "owner_email"),
    owner_uid: str(fields, "owner_uid"),
    uploaded_at: str(fields, "uploaded_at"),
    locked: bool(fields, "locked"),
    title_hidden: bool(fields, "title_hidden"),
    lock_salt: str(fields, "lock_salt"),
    lock_iterations: num(fields, "lock_iterations"),
    lock_iv: str(fields, "lock_iv"),
    lock_ciphertext: str(fields, "lock_ciphertext"),
    locked_chunks: [],
  };
}

function bool(fields: Record<string, FsValue>, key: string): boolean {
  const value = fields[key];
  return Boolean(value && "booleanValue" in value && value.booleanValue);
}

export async function loadPublicNotes(projectId: string, apiKey: string): Promise<ResearchNote[]> {
  const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/research_notes`;
  const notes: ResearchNote[] = [];
  let pageToken = "";
  for (let page = 0; page < 3; page += 1) {
    const url = new URL(root);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Firestore ${response.status}`);
    const payload = (await response.json()) as { documents?: (FsDoc & { name?: string })[]; nextPageToken?: string };
    for (const doc of payload.documents ?? []) {
      const note = noteFromDoc(doc);
      if (!note) continue;
      const count = num(doc.fields ?? {}, "chunk_count");
      if (count > 0 && doc.name) {
        const chunks = await loadChunks(doc.name, apiKey);
        if (note.locked) note.locked_chunks = chunks.locked;
        else note.body = chunks.text;
      }
      notes.push(note);
    }
    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }
  return notes;
}

async function loadChunks(name: string, apiKey: string): Promise<{ text: string; locked: { index: number; iv: string; ciphertext: string }[] }> {
  const url = new URL(`https://firestore.googleapis.com/v1/${name}/chunks`);
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return { text: "", locked: [] };
  const payload = (await response.json()) as { documents?: FsDoc[] };
  const rows = (payload.documents ?? []).map((doc) => ({
    index: num(doc.fields ?? {}, "index"),
    text: str(doc.fields ?? {}, "text"),
    iv: str(doc.fields ?? {}, "iv"),
    ciphertext: str(doc.fields ?? {}, "ciphertext"),
  }));
  return {
    text: stitchBody("", rows.map((row) => ({ index: row.index, text: row.text }))),
    locked: rows.map((row) => ({ index: row.index, iv: row.iv, ciphertext: row.ciphertext })),
  };
}
