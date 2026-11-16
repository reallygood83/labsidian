import { placeBody, stitchBody } from "../../packages/types/body";
import type { ResearchNote } from "../../packages/types/research-note";
import { noteDocumentId, type SealedChunk } from "../../packages/shared/lock";
import { LabsidianError } from "../errors";
import type { HttpClient } from "../http/types";

type FsValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: { stringValue: string }[] } };

export function toFirestoreFields(note: ResearchNote, chunkCount = 0): { fields: Record<string, FsValue> } {
  const strings: [keyof ResearchNote, string][] = [
    ["title", note.title],
    ["series", note.series],
    ["source", note.source],
    ["source_id", note.locked ? "" : note.source_id],
    ["doc_id", note.doc_id],
    ["team_id", note.team_id],
    ["type", note.type],
    ["publisher", note.publisher],
    ["published", note.published],
    ["url", note.locked ? "" : note.url],
    ["pdf_url", note.locked ? "" : note.pdf_url],
    ["query", note.locked ? "" : note.query],
    ["collected", note.collected],
    ["converter", note.converter],
    ["summary_model", note.summary_model],
    ["summary", note.locked ? "" : note.summary],
    ["body", note.locked || chunkCount > 0 ? "" : note.body],
    ["excerpt", note.excerpt],
    ["display_name", note.display_name],
    ["owner_uid", note.owner_uid],
  ];
  const fields: Record<string, FsValue> = {};
  for (const [key, value] of strings) fields[key] = { stringValue: value };
  fields.author = { arrayValue: { values: (note.locked ? [] : note.author).map((item) => ({ stringValue: item })) } };
  fields.keywords = { arrayValue: { values: (note.locked ? [] : note.keywords).map((item) => ({ stringValue: item })) } };
  fields.tags = { arrayValue: { values: (note.locked ? [] : note.tags).map((item) => ({ stringValue: item })) } };
  fields.locked = { booleanValue: note.locked };
  fields.title_hidden = { booleanValue: note.title_hidden };
  fields.lock_salt = { stringValue: note.lock_salt };
  fields.lock_iterations = { integerValue: String(note.lock_iterations) };
  fields.lock_iv = { stringValue: note.lock_iv };
  fields.lock_ciphertext = { stringValue: note.lock_ciphertext };
  fields.convert_warnings = { integerValue: String(note.convert_warnings) };
  fields.chunk_count = { integerValue: String(chunkCount) };
  fields.team_shared = { booleanValue: note.team_shared };
  fields.briefing_public = { booleanValue: note.briefing_public };
  if (note.uploaded_at) fields.uploaded_at = { timestampValue: note.uploaded_at };
  return { fields };
}

export function fromFirestoreDocument(doc: unknown): ResearchNote | null {
  if (!doc || typeof doc !== "object" || !("fields" in doc)) return null;
  const fields = (doc as { fields?: Record<string, FsValue> }).fields ?? {};
  const str = (key: string) => {
    const value = fields[key];
    return value && "stringValue" in value ? value.stringValue : "";
  };
  const list = (key: string) => {
    const value = fields[key];
    if (!value || !("arrayValue" in value)) return [];
    return (value.arrayValue.values ?? []).map((item) => item.stringValue).filter(Boolean);
  };
  const docId = str("doc_id");
  const sourceId = str("source_id");
  if (!docId && !sourceId) return null;
  const warnings = fields.convert_warnings;
  return {
    title: str("title"),
    series: str("series"),
    source: str("source"),
    source_id: sourceId,
    doc_id: docId,
    team_id: str("team_id"),
    type: str("type"),
    publisher: str("publisher"),
    author: list("author"),
    published: str("published"),
    url: str("url"),
    pdf_url: str("pdf_url"),
    query: str("query"),
    keywords: list("keywords"),
    collected: str("collected"),
    converter: str("converter"),
    convert_warnings: warnings && "integerValue" in warnings ? Number(warnings.integerValue) : 0,
    summary_model: str("summary_model"),
    team_shared: true,
    briefing_public: Boolean(fields.briefing_public && "booleanValue" in fields.briefing_public && fields.briefing_public.booleanValue),
    tags: list("tags"),
    summary: str("summary"),
    body: str("body"),
    excerpt: str("excerpt"),
    owner_email: "",
    display_name: str("display_name"),
    owner_uid: str("owner_uid"),
    uploaded_at: fields.uploaded_at && "timestampValue" in fields.uploaded_at ? fields.uploaded_at.timestampValue : "",
    locked: Boolean(fields.locked && "booleanValue" in fields.locked && fields.locked.booleanValue),
    title_hidden: Boolean(fields.title_hidden && "booleanValue" in fields.title_hidden && fields.title_hidden.booleanValue),
    lock_salt: str("lock_salt"),
    lock_iterations: fields.lock_iterations && "integerValue" in fields.lock_iterations ? Number(fields.lock_iterations.integerValue) : 0,
    lock_iv: str("lock_iv"),
    lock_ciphertext: str("lock_ciphertext"),
    locked_chunks: [],
  };
}

export async function documentId(note: Pick<ResearchNote, "doc_id" | "team_id" | "owner_uid" | "source_id">): Promise<string> {
  if (note.doc_id) return note.doc_id;
  return noteDocumentId(note.team_id, note.owner_uid, note.source_id);
}

function collection(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/research_notes`;
}

export function chunkCountOf(doc: unknown): number {
  if (!doc || typeof doc !== "object" || !("fields" in doc)) return 0;
  const fields = (doc as { fields?: Record<string, FsValue> }).fields ?? {};
  const value = fields.chunk_count;
  return value && "integerValue" in value ? Number(value.integerValue) : 0;
}

export async function upsertResearchNote(http: HttpClient, projectId: string, idToken: string, note: ResearchNote): Promise<void> {
  const placed = note.locked ? { inline: "", chunks: [] as string[] } : placeBody(note.body);
  const sealed: SealedChunk[] = note.locked ? note.locked_chunks : [];
  const id = await documentId(note);
  note = { ...note, doc_id: id };
  const payload = JSON.stringify(toFirestoreFields({ ...note, body: note.locked ? "" : placed.inline }, note.locked ? sealed.length : placed.chunks.length));
  const headers = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
  const patch = await http.request({
    url: `${collection(projectId)}/${encodeURIComponent(id)}`,
    method: "PATCH",
    headers,
    body: payload,
  });
  if (patch.status >= 400 && patch.status !== 404) {
    throw new LabsidianError(`팀 서고에 올리지 못했어요 (${patch.status}). 내 볼트의 노트는 그대로예요.`);
  }
  if (patch.status === 404) {
    const created = await http.request({
      url: `${collection(projectId)}?documentId=${encodeURIComponent(id)}`,
      method: "POST",
      headers,
      body: payload,
    });
    if (created.status >= 400) {
      throw new LabsidianError(`팀 서고에 올리지 못했어요 (${created.status}). 내 볼트의 노트는 그대로예요.`);
    }
  }
  const chunkTotal = note.locked ? sealed.length : placed.chunks.length;
  for (let index = 0; index < chunkTotal; index += 1) {
    const fields = note.locked
      ? {
          index: { integerValue: String(index) },
          iv: { stringValue: sealed[index]?.iv ?? "" },
          ciphertext: { stringValue: sealed[index]?.ciphertext ?? "" },
          text: { stringValue: "" },
        }
      : {
          index: { integerValue: String(index) },
          text: { stringValue: placed.chunks[index] ?? "" },
        };
    const chunkBody = JSON.stringify({ fields });
    const chunkUrl = `${collection(projectId)}/${encodeURIComponent(id)}/chunks/${String(index).padStart(4, "0")}`;
    const written = await http.request({ url: chunkUrl, method: "PATCH", headers, body: chunkBody });
    if (written.status === 404) {
      const created = await http.request({
        url: `${collection(projectId)}/${encodeURIComponent(id)}/chunks?documentId=${String(index).padStart(4, "0")}`,
        method: "POST",
        headers,
        body: chunkBody,
      });
      if (created.status >= 400) {
        throw new LabsidianError(`본문 조각 ${index + 1}을 올리지 못했어요 (${created.status}). 내 볼트의 노트는 그대로예요.`);
      }
    } else if (written.status >= 400) {
      throw new LabsidianError(`본문 조각 ${index + 1}을 올리지 못했어요 (${written.status}). 내 볼트의 노트는 그대로예요.`);
    }
  }
  const listed = await http.request({
    url: `${collection(projectId)}/${encodeURIComponent(id)}/chunks?pageSize=200`,
    headers,
  });
  if (listed.status < 400) {
    const payload = JSON.parse(listed.text) as { documents?: { name?: string }[] };
    for (const doc of payload.documents ?? []) {
      const name = doc.name?.split("/").pop() ?? "";
      const index = Number(name);
      if (!Number.isInteger(index) || index < chunkTotal) continue;
      await http.request({
        url: `${collection(projectId)}/${encodeURIComponent(id)}/chunks/${name}`,
        method: "DELETE",
        headers,
      });
    }
  }
}

export async function hydrateBody(http: HttpClient, projectId: string, idToken: string, doc: unknown, note: ResearchNote, apiKey = ""): Promise<ResearchNote> {
  const count = chunkCountOf(doc);
  if (count <= 0) return note;
  const chunkUrl = new URL(`${collection(projectId)}/${encodeURIComponent(note.doc_id)}/chunks`);
  chunkUrl.searchParams.set("pageSize", "100");
  if (!idToken && apiKey) chunkUrl.searchParams.set("key", apiKey);
  const response = await http.request({
    url: chunkUrl.toString(),
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
  });
  if (response.status >= 400) {
    throw new LabsidianError(`본문 조각을 읽지 못했어요 (${response.status}). 내 볼트의 노트는 그대로예요.`);
  }
  const payload = JSON.parse(response.text) as { documents?: { fields?: Record<string, FsValue> }[] };
  const chunks = (payload.documents ?? []).map((item) => {
    const fields = item.fields ?? {};
    const index = fields.index && "integerValue" in fields.index ? Number(fields.index.integerValue) : 0;
    const text = fields.text && "stringValue" in fields.text ? fields.text.stringValue : "";
    const iv = fields.iv && "stringValue" in fields.iv ? fields.iv.stringValue : "";
    const ciphertext = fields.ciphertext && "stringValue" in fields.ciphertext ? fields.ciphertext.stringValue : "";
    return { index, text, iv, ciphertext };
  });
  if (note.locked) {
    return {
      ...note,
      body: "",
      locked_chunks: chunks.map((chunk) => ({ index: chunk.index, iv: chunk.iv, ciphertext: chunk.ciphertext })),
    };
  }
  return { ...note, body: stitchBody("", chunks.map((chunk) => ({ index: chunk.index, text: chunk.text }))) };
}

export async function listResearchNotes(http: HttpClient, projectId: string, idToken: string, teamId: string, ownerUid = ""): Promise<ResearchNote[]> {
  const where = ownerUid
    ? { fieldFilter: { field: { fieldPath: "owner_uid" }, op: "EQUAL", value: { stringValue: ownerUid } } }
    : { fieldFilter: { field: { fieldPath: "team_id" }, op: "EQUAL", value: { stringValue: teamId } } };
  const notes: ResearchNote[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: "research_notes" }],
      where,
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 100,
    };
    if (cursor) structuredQuery.startAfter = { values: [{ referenceValue: cursor }] };
    const response = await http.request({
      url: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`,
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
    });
    if (response.status >= 400) throw new LabsidianError(`팀 서고를 읽지 못했어요 (${response.status}). 내 볼트의 노트는 그대로예요.`);
    const payload = JSON.parse(response.text) as { document?: { name?: string } }[];
    const rows = payload.filter((row) => row.document?.name);
    for (const row of rows) {
      const note = fromFirestoreDocument(row.document);
      if (note) notes.push(note);
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1]?.document?.name ?? "";
    if (!cursor) break;
  }
  return notes;
}

export async function patchNoteTeamId(http: HttpClient, projectId: string, idToken: string, docId: string, teamId: string): Promise<void> {
  const response = await http.request({
    url: `${collection(projectId)}/${encodeURIComponent(docId)}?updateMask.fieldPaths=team_id&updateMask.fieldPaths=owner_email`,
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { team_id: { stringValue: teamId } } }),
  });
  if (response.status >= 400) throw new LabsidianError(`글을 옮기지 못했어요 (${response.status}). 본문은 그대로예요.`);
}

export async function listVisibleNotes(
  http: HttpClient,
  projectId: string,
  idToken: string,
  scope: { teamId: string; ownerUid: string; personal: boolean },
): Promise<ResearchNote[]> {
  const filters = scope.personal
    ? [andFilter([eq("owner_uid", scope.ownerUid), eq("briefing_public", true)]), eq("owner_uid", scope.ownerUid)]
    : [andFilter([eq("team_id", scope.teamId), eq("briefing_public", true)]), andFilter([eq("team_id", scope.teamId), eq("owner_uid", scope.ownerUid)])];
  const byId = new Map<string, ResearchNote>();
  for (const where of filters) {
    const notes = await queryNotes(http, projectId, idToken, where);
    for (const note of notes) {
      if (note.doc_id) byId.set(note.doc_id, note);
    }
  }
  return [...byId.values()];
}

function eq(path: string, value: string | boolean): Record<string, unknown> {
  return {
    fieldFilter: {
      field: { fieldPath: path },
      op: "EQUAL",
      value: typeof value === "boolean" ? { booleanValue: value } : { stringValue: value },
    },
  };
}

function andFilter(filters: Record<string, unknown>[]): Record<string, unknown> {
  return { compositeFilter: { op: "AND", filters } };
}

async function queryNotes(http: HttpClient, projectId: string, idToken: string, where: Record<string, unknown>): Promise<ResearchNote[]> {
  const notes: ResearchNote[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: "research_notes" }],
      where,
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 100,
    };
    if (cursor) structuredQuery.startAfter = { values: [{ referenceValue: cursor }] };
    const response = await http.request({
      url: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`,
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
    });
    if (response.status >= 400) throw new LabsidianError(`팀 서고를 읽지 못했어요 (${response.status}). 목록을 비우지 않았어요.`);
    const payload = JSON.parse(response.text) as { document?: { name?: string } }[];
    const rows = payload.filter((row) => row.document?.name);
    for (const row of rows) {
      const note = fromFirestoreDocument(row.document);
      if (note) notes.push(note);
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1]?.document?.name ?? "";
    if (!cursor) break;
  }
  return notes;
}

export async function getResearchNote(http: HttpClient, projectId: string, idToken: string, docId: string, apiKey = ""): Promise<ResearchNote | null> {
  const url = new URL(`${collection(projectId)}/${encodeURIComponent(docId)}`);
  if (!idToken && apiKey) url.searchParams.set("key", apiKey);
  const response = await http.request({
    url: url.toString(),
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
  });
  if (response.status === 404) return null;
  if (response.status >= 400) throw new LabsidianError(`팀 서고에서 노트를 찾지 못했어요 (${response.status}). 내 볼트의 노트는 그대로예요.`);
  const doc = JSON.parse(response.text) as unknown;
  const note = fromFirestoreDocument(doc);
  if (!note) return null;
  return hydrateBody(http, projectId, idToken, doc, note, apiKey);
}
