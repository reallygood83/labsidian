import { LabsidianError } from "../errors";
import { requestHeaders } from "../http/types";
import { normalizeDate, uniqueAuthors } from "../text";
import type { CollectedDocument, SourceModule } from "./types";
import { xmlText } from "./xml";

const API = "https://www.riss.kr/openApi";

export interface RissItem {
  id: string;
  title: string;
  authors: string[];
  publisher: string;
  published: string;
  url: string;
  abstract: string;
  hasFulltext: boolean;
}

export function parseRissXml(xml: string): { items: RissItem[]; error?: string } {
  const error = xmlText(xml, "ErrorMessage");
  const blocks = xml.split(/<riss\.title>/i).slice(1);
  const items: RissItem[] = [];
  for (const block of blocks) {
    const title = block.split(/<\/riss\.title>/i)[0]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    if (!title) continue;
    const url = xmlText(block, "riss.url");
    const id = /[?&]id=([^&"<\s]+)/.exec(url)?.[1] ?? title.slice(0, 24).replace(/\s+/g, "-");
    const image = xmlText(block, "riss.image");
    items.push({
      id,
      title,
      authors: uniqueAuthors(xmlText(block, "riss.author").split(/[;,]/)),
      publisher: xmlText(block, "riss.publisher"),
      published: normalizeDate(xmlText(block, "riss.pubdate") || xmlText(block, "riss.date")),
      url,
      abstract: xmlText(block, "riss.abstract") || xmlText(block, "riss.abs"),
      hasFulltext: Boolean(image) && !/^n$/i.test(image),
    });
  }
  if (!items.length) return { items: [], error: error || undefined };
  return { items };
}

export const rissSource: SourceModule = {
  id: "riss",
  label: "RISS",
  blurb: "기관 인증키가 있어야 합니다. 비영리 기관과 대학만 키를 받을 수 있어요.",
  requiresKey: true,
  keyHint: "RISS Open API는 기관 키만 발급해요. 키가 없으면 이 출처는 꺼 둡니다.",
  async search(query, ctx) {
    const key = ctx.keys.riss ?? "";
    if (!key) throw new LabsidianError("RISS 기관 키가 없어요. 설정에 키를 넣으면 검색할 수 있어요.");
    const params = new URLSearchParams({
      key,
      version: "1.0",
      type: "A",
      keyword: query,
      rsnum: "10",
    });
    const response = await ctx.http.request({
      url: `${API}?${params.toString()}`,
      headers: requestHeaders({ Accept: "application/xml,text/xml" }),
    });
    const parsed = parseRissXml(response.text);
    if (response.status >= 400 || parsed.error) {
      throw new LabsidianError(parsed.error ?? `RISS 요청이 실패했습니다 (${response.status}).`);
    }
    return parsed.items.map((item) => ({
      source: "riss" as const,
      sourceId: `riss-${item.id.replace(/[^A-Za-z0-9_-]/g, "")}`,
      remoteId: item.id,
      title: item.title,
      url: item.url,
      published: item.published,
      authors: item.authors,
      publisher: item.publisher || "RISS",
      keywords: [],
      hasPdf: false,
      abstract: item.abstract,
      series: "",
      docType: "논문",
    }));
  },
  async load(hit) {
    return { hit, abstract: hit.abstract, toc: "", attachments: [] } satisfies CollectedDocument;
  },
  async download() {
    throw new LabsidianError("RISS는 원문 파일 주소를 직접 주지 않아요. 원문 페이지를 열어 주세요.");
  },
};
