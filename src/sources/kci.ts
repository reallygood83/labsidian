import { LabsidianError } from "../errors";
import { browserHeaders } from "../http/types";
import { normalizeDate, uniqueAuthors } from "../text";
import type { CollectedDocument, SearchHit, SourceModule } from "./types";
import { xmlText, xmlTexts } from "./xml";

const API = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";

export interface KciArticle {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  publisher: string;
  published: string;
  url: string;
  abstract: string;
  keywords: string[];
  open: boolean;
}

export function parseKciXml(xml: string): { articles: KciArticle[]; error?: string } {
  const messages = xmlTexts(xml, "resultMsg").filter((message) => message && !/^ok$/i.test(message) && !/성공/.test(message));
  const chunks = xml.split(/<record\b[^>]*>/i).slice(1);
  const articles: KciArticle[] = [];
  for (const chunk of chunks) {
    const title = xmlText(chunk, "article-title");
    if (!title) continue;
    const id = /article-id="([^"]+)"/i.exec(chunk)?.[1] ?? title.slice(0, 40);
    const year = xmlText(chunk, "pub-year");
    const month = xmlText(chunk, "pub-mon");
    articles.push({
      id,
      title,
      authors: uniqueAuthors(xmlTexts(chunk, "author-name")),
      journal: xmlText(chunk, "journal-name"),
      publisher: xmlText(chunk, "publisher-name"),
      published: normalizeDate(month ? `${year}${month.padStart(2, "0")}01` : year),
      url: xmlText(chunk, "url"),
      abstract: xmlText(chunk, "abstract"),
      keywords: xmlTexts(chunk, "keyword"),
      open: /^y$/i.test(xmlText(chunk, "orte-open-yn")),
    });
  }
  if (!articles.length && messages.length) return { articles: [], error: messages.join(" ") };
  return { articles };
}

function toHit(article: KciArticle): SearchHit {
  return {
    source: "kci",
    sourceId: `kci-${article.id.replace(/[^A-Za-z0-9_-]/g, "")}`,
    remoteId: article.id,
    title: article.title,
    url: article.url,
    published: article.published,
    authors: article.authors,
    publisher: article.publisher || article.journal || "KCI",
    keywords: article.keywords,
    hasPdf: false,
    abstract: article.abstract,
    series: article.journal,
    docType: "논문",
  };
}

export const kciSource: SourceModule = {
  id: "kci",
  label: "KCI",
  blurb: "한국연구재단 논문 검색입니다. 인증키가 있어야 켜집니다. PDF 주소는 주지 않아요.",
  requiresKey: true,
  keyHint: "KCI에 로그인한 뒤 Open API 인증키를 신청해요. 문의는 kciadmin@nrf.re.kr 입니다.",
  async search(query, ctx) {
    const key = ctx.keys.kci ?? "";
    if (!key) throw new LabsidianError("KCI 인증키가 없어요. 설정에서 키를 저장하면 이 출처를 켤 수 있어요.");
    const params = new URLSearchParams({
      apiCode: "articleSearch",
      key,
      title: query,
      displayCount: "10",
      page: "1",
    });
    const response = await ctx.http.request({
      url: `${API}?${params.toString()}`,
      headers: browserHeaders({ Accept: "application/xml,text/xml" }),
    });
    const parsed = parseKciXml(response.text);
    if (response.status >= 400 || parsed.error) {
      throw new LabsidianError(parsed.error ?? `KCI 요청이 실패했습니다 (${response.status}).`);
    }
    return parsed.articles.map(toHit);
  },
  async load(hit) {
    return { hit, abstract: hit.abstract, toc: "", attachments: [] } satisfies CollectedDocument;
  },
  async download() {
    throw new LabsidianError("KCI는 PDF 파일을 직접 주지 않아요. 원문 페이지를 열어 주세요.");
  },
};
