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
  const docId = str(fields, "doc_id");
  if (!sourceId && !docId) return null;
  return {
    title: str(fields, "title"),
    series: str(fields, "series"),
    source: str(fields, "source"),
    source_id: sourceId,
    doc_id: docId,
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
    briefing_public: bool(fields, "briefing_public"),
    display_name: str(fields, "display_name"),
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

export async function loadPublicNotes(projectId: string, apiKey: string, scope: { mode: "personal" | "team"; teamId: string; ownerUid: string }): Promise<ResearchNote[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${encodeURIComponent(apiKey)}`;
  const where = scope.mode === "personal"
    ? {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "owner_uid" }, op: "EQUAL", value: { stringValue: scope.ownerUid } } },
            { fieldFilter: { field: { fieldPath: "briefing_public" }, op: "EQUAL", value: { booleanValue: true } } },
          ],
        },
      }
    : {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "team_id" }, op: "EQUAL", value: { stringValue: scope.teamId } } },
            { fieldFilter: { field: { fieldPath: "briefing_public" }, op: "EQUAL", value: { booleanValue: true } } },
          ],
        },
      };
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "research_notes" }], where, limit: 100 } }),
  });
  if (!response.ok) throw new Error("브리핑을 읽지 못했어요. 배포용 값의 팀 설정을 확인해 주세요.");
  const payload = (await response.json()) as { document?: FsDoc & { name?: string } }[];
  const notes: ResearchNote[] = [];
  for (const row of payload) {
    if (!row.document) continue;
    const note = noteFromDoc(row.document);
    if (!note) continue;
    if (scope.mode === "personal" && !note.briefing_public) continue;
    const count = num(row.document.fields ?? {}, "chunk_count");
    if (count > 0 && row.document.name) {
      const chunks = await loadChunks(row.document.name, apiKey);
      if (note.locked) note.locked_chunks = chunks.locked;
      else note.body = chunks.text;
    }
    notes.push(note);
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
