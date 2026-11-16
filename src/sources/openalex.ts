import { LabsidianError } from "../errors";
import { browserHeaders } from "../http/types";
import { uniqueAuthors } from "../text";
import type { CollectedDocument, SearchHit, SourceContext, SourceModule } from "./types";

const API = "https://api.openalex.org/works";
const PAGE_SIZE = 10;

interface OpenAlexWork {
  id?: string;
  display_name?: string;
  publication_date?: string;
  authorships?: { author?: { display_name?: string } }[];
  keywords?: { display_name?: string }[];
  abstract_inverted_index?: Record<string, number[]> | null;
  doi?: string | null;
  primary_location?: { landing_page_url?: string | null; pdf_url?: string | null } | null;
  open_access?: { oa_url?: string | null; is_oa?: boolean } | null;
  type?: string;
}

export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const pairs: { word: string; pos: number }[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) pairs.push({ word, pos });
  }
  pairs.sort((a, b) => a.pos - b.pos);
  return pairs.map((pair) => pair.word).join(" ");
}

export function openAlexId(raw: string): string {
  const tail = raw.split("/").pop() ?? raw;
  return tail.replace(/[^A-Za-z0-9_-]/g, "");
}

export function parseOpenAlexWorks(payload: unknown): { hits: SearchHit[]; error?: string } {
  if (!payload || typeof payload !== "object") return { hits: [], error: "OpenAlex 응답을 읽지 못했습니다." };
  const record = payload as { error?: unknown; message?: unknown; results?: unknown };
  if (typeof record.error === "string" && !Array.isArray(record.results)) {
    const message = typeof record.message === "string" ? record.message : record.error;
    return { hits: [], error: `OpenAlex: ${message}` };
  }
  const results = Array.isArray(record.results) ? record.results : [];
  const hits = results.map((item) => workToHit(item as OpenAlexWork)).filter((hit): hit is SearchHit => hit !== null);
  return { hits };
}

function workToHit(work: OpenAlexWork): SearchHit | null {
  const rawId = work.id ?? "";
  const short = openAlexId(rawId);
  if (!short || !work.display_name) return null;
  const oaUrl = work.open_access?.oa_url ?? work.primary_location?.pdf_url ?? "";
  const landing = work.primary_location?.landing_page_url || work.doi || rawId;
  return {
    source: "openalex",
    sourceId: `openalex-${short}`,
    remoteId: short,
    title: work.display_name,
    url: landing,
    published: work.publication_date ?? "",
    authors: uniqueAuthors((work.authorships ?? []).map((entry) => entry.author?.display_name ?? "")),
    publisher: "OpenAlex",
    keywords: uniqueAuthors((work.keywords ?? []).map((keyword) => keyword.display_name ?? "")).slice(0, 12),
    hasPdf: Boolean(oaUrl),
    abstract: reconstructAbstract(work.abstract_inverted_index),
    series: "",
    docType: work.type || "논문",
  };
}

function pdfUrlOf(work: OpenAlexWork): string {
  return work.open_access?.oa_url || work.primary_location?.pdf_url || "";
}

export const openalexSource: SourceModule = {
  id: "openalex",
  label: "OpenAlex",
  blurb: "키 없이 검색됩니다. 무료 키와 메일 주소를 넣으면 하루 한도가 늘어납니다.",
  requiresKey: false,
  keyHint: "선택 사항입니다. https://openalex.org 에서 무료 키를 받을 수 있습니다.",
  async search(query, ctx) {
    const params = new URLSearchParams({
      search: query,
      "per-page": String(PAGE_SIZE),
      select: "id,display_name,publication_date,authorships,keywords,abstract_inverted_index,doi,primary_location,open_access,type",
    });
    if (ctx.openalexMailto) params.set("mailto", ctx.openalexMailto);
    if (ctx.keys.openalex) params.set("api_key", ctx.keys.openalex);
    const response = await ctx.http.request({
      url: `${API}?${params.toString()}`,
      headers: browserHeaders({ Accept: "application/json" }),
    });
    let payload: unknown = null;
    try {
      payload = JSON.parse(response.text) as unknown;
    } catch {
      throw new LabsidianError(`OpenAlex 응답이 JSON이 아닙니다 (${response.status}).`);
    }
    const parsed = parseOpenAlexWorks(payload);
    if (response.status >= 400 || parsed.error) {
      throw new LabsidianError(parsed.error ?? `OpenAlex 요청이 실패했습니다 (${response.status}).`);
    }
    return parsed.hits.map((hit) => ({ ...hit, keywords: hit.keywords }));
  },
  async load(hit) {
    const response = await hitContext(hit);
    return response;
  },
  async download(attachment, ctx, referer) {
    const response = await ctx.http.request({
      url: attachment.ref.url ?? "",
      headers: browserHeaders({ Referer: referer, Accept: "application/pdf,*/*" }),
    });
    if (response.status >= 400) throw new LabsidianError(`원문 파일을 받지 못했습니다 (${response.status}).`);
    return response.bytes;
  },
};

async function hitContext(hit: SearchHit): Promise<CollectedDocument> {
  const oa = hit.hasPdf ? hit.url : "";
  const attachments = oa
    ? [{ name: `${hit.remoteId}.pdf`, ref: { url: "" } }]
    : [];
  return { hit, abstract: hit.abstract, toc: "", attachments };
}

/** Detail is already on the search hit. PDF URL is recovered by a second lightweight lookup when downloading. */
export async function resolveOpenAlexPdf(hit: SearchHit, ctx: SourceContext): Promise<string> {
  const params = new URLSearchParams();
  if (ctx.openalexMailto) params.set("mailto", ctx.openalexMailto);
  if (ctx.keys.openalex) params.set("api_key", ctx.keys.openalex);
  const suffix = params.size ? `?${params.toString()}` : "";
  const response = await ctx.http.request({
    url: `${API}/https://openalex.org/${hit.remoteId}${suffix}`,
    headers: browserHeaders({ Accept: "application/json" }),
  });
  if (response.status >= 400) return "";
  try {
    const work = JSON.parse(response.text) as OpenAlexWork;
    return pdfUrlOf(work);
  } catch {
    return "";
  }
}

export async function loadOpenAlex(hit: SearchHit, ctx: SourceContext): Promise<CollectedDocument> {
  const pdf = hit.hasPdf ? await resolveOpenAlexPdf(hit, ctx) : "";
  const attachments = pdf ? [{ name: `${hit.title}.pdf`, ref: { url: pdf } }] : [];
  return {
    hit: { ...hit, hasPdf: Boolean(pdf) },
    abstract: hit.abstract,
    toc: "",
    attachments,
  };
}

openalexSource.load = loadOpenAlex;
