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
  best_oa_location?: { landing_page_url?: string | null; pdf_url?: string | null } | null;
  locations?: { pdf_url?: string | null }[] | null;
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

export const OPENALEX_QUOTA_MESSAGE =
  "OpenAlex 무료 한도가 다 찼어요. 키가 없으면 같은 인터넷을 쓰는 사람들과 하루 한도를 나눠 써요. openalex.org에서 무료 키를 받아 설정 → 출처 → OpenAlex에 넣어 주세요.";
export const OPENALEX_KEY_MESSAGE = "OpenAlex 키가 맞지 않거나 아직 켜지지 않았어요. 메일로 받은 확인 링크를 눌렀는지 보고, 설정 → 출처에서 키를 다시 넣어 주세요.";

export function parseOpenAlexWorks(payload: unknown, status = 200, hasKey = false): { hits: SearchHit[]; error?: string } {
  if (!payload || typeof payload !== "object") return { hits: [], error: "OpenAlex 응답을 읽지 못했습니다." };
  const record = payload as { error?: unknown; message?: unknown; reason?: unknown; results?: unknown };
  if (status === 429 || record.reason === "daily_budget") {
    return { hits: [], error: hasKey ? "OpenAlex 키의 오늘 한도를 다 썼어요. 한국 시간 오전 9시에 다시 채워져요." : OPENALEX_QUOTA_MESSAGE };
  }
  if (status === 401 || status === 403) return { hits: [], error: OPENALEX_KEY_MESSAGE };
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
  const pdf = pdfUrlOf(work);
  const landing = work.primary_location?.landing_page_url || work.doi || rawId;
  return {
    source: "openalex",
    sourceId: `openalex-${short}`,
    remoteId: short,
    title: work.display_name,
    url: landing,
    doi: work.doi ?? "",
    published: work.publication_date ?? "",
    authors: uniqueAuthors((work.authorships ?? []).map((entry) => entry.author?.display_name ?? "")),
    publisher: "OpenAlex",
    keywords: uniqueAuthors((work.keywords ?? []).map((keyword) => keyword.display_name ?? "")).slice(0, 12),
    hasPdf: Boolean(pdf),
    pdfUrl: pdf,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    series: "",
    docType: work.type || "논문",
  };
}

/**
 * Only real PDF links count. `open_access.oa_url` is usually the publisher's landing page,
 * which downloads as HTML, so it is used only when it clearly points at a PDF.
 */
export function pdfUrlOf(work: OpenAlexWork): string {
  const candidates = [
    work.best_oa_location?.pdf_url,
    work.primary_location?.pdf_url,
    ...(work.locations ?? []).map((location) => location.pdf_url),
  ];
  const direct = candidates.find((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
  if (direct) return direct;
  const oa = work.open_access?.oa_url ?? "";
  return /\.pdf(?:$|[?#])/i.test(oa) ? oa : "";
}

export const openalexSource: SourceModule = {
  id: "openalex",
  label: "OpenAlex",
  blurb: "키 없이도 되지만, 같은 인터넷을 쓰는 사람들과 하루 한도를 나눠 써서 금방 막힐 수 있어요. 무료 키를 넣는 걸 권해요.",
  requiresKey: false,
  keyHint: "무료예요. 위 링크에서 메일 주소를 넣으면 키가 와요. 메일 속 확인 링크를 누른 뒤 붙여 넣어 주세요.",
  async search(query, ctx) {
    const params = new URLSearchParams({
      search: query,
      "per-page": String(PAGE_SIZE),
      select: "id,display_name,publication_date,authorships,keywords,abstract_inverted_index,doi,primary_location,best_oa_location,locations,open_access,type",
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
      if (response.status === 429) throw new LabsidianError(OPENALEX_QUOTA_MESSAGE);
      throw new LabsidianError(`OpenAlex 응답이 JSON이 아닙니다 (${response.status}).`);
    }
    const parsed = parseOpenAlexWorks(payload, response.status, Boolean(ctx.keys.openalex));
    if (response.status >= 400 || parsed.error) {
      throw new LabsidianError(parsed.error ?? `OpenAlex 요청이 실패했습니다 (${response.status}).`);
    }
    return parsed.hits.map((hit) => ({ ...hit, keywords: hit.keywords }));
  },
  load: (hit, ctx) => loadOpenAlex(hit, ctx),
  async download(attachment, ctx, referer) {
    const response = await ctx.http.request({
      url: attachment.ref.url ?? "",
      headers: browserHeaders({ Referer: referer, Accept: "application/pdf,*/*" }),
    });
    if (response.status >= 400) throw new LabsidianError(`원문 파일을 받지 못했습니다 (${response.status}).`);
    return response.bytes;
  },
};

/** Detail is already on the search hit. PDF URL is recovered by a second lightweight lookup when downloading. */
export async function resolveOpenAlexPdf(hit: SearchHit, ctx: SourceContext): Promise<string> {
  const params = new URLSearchParams();
  if (ctx.openalexMailto) params.set("mailto", ctx.openalexMailto);
  if (ctx.keys.openalex) params.set("api_key", ctx.keys.openalex);
  const suffix = params.size ? `?${params.toString()}` : "";
  const response = await ctx.http.request({
    url: `${API}/${encodeURIComponent(hit.remoteId)}${suffix}`,
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
  // The search result already carries the PDF link; look it up again only for older hits without it.
  const pdf = hit.pdfUrl || (hit.hasPdf ? await resolveOpenAlexPdf(hit, ctx) : "");
  const attachments = pdf ? [{ name: `${hit.title}.pdf`, ref: { url: pdf } }] : [];
  return {
    hit: { ...hit, hasPdf: Boolean(pdf) },
    abstract: hit.abstract,
    toc: "",
    attachments,
  };
}

