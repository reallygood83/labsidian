import { LabsidianError } from "../errors";
import { browserHeaders } from "../http/types";
import { collapseWs, normalizeDate, stripTags, uniqueAuthors } from "../text";
import { cellTexts, hiddenInput, rows } from "./html";
import type { Attachment, CollectedDocument, SearchHit, SourceContext, SourceModule } from "./types";

const LIST_URL = "https://www.kofic.or.kr/kofic/business/rsch/findPolicyList.do";
const DETAIL_URL = "https://www.kofic.or.kr/kofic/business/rsch/findPolicyDetail.do";
const DOWNLOAD_URL = "https://www.kofic.or.kr/kofic/business/comm/file/downloadFile.do";
const RESEARCH_CATEGORY = "10131001";

export interface KoficListItem {
  id: string;
  title: string;
  category: string;
  published: string;
}

export interface KoficFile {
  fileUrl: string;
  fileNm: string;
  dnFileName: string;
}

export interface KoficDetail {
  id: string;
  title: string;
  series: string;
  authors: string[];
  published: string;
  pages: string;
  isbn: string;
  abstract: string;
  toc: string;
  category: string;
  files: KoficFile[];
}

export function parseKoficList(html: string): KoficListItem[] {
  const items: KoficListItem[] = [];
  for (const row of rows(html)) {
    const id = /fn_goDetailPage\((\d+)\)/.exec(row)?.[1];
    if (!id) continue;
    const title = collapseWs(stripTags(/fn_goDetailPage\(\d+\);">\s*([\s\S]*?)<\/a>/i.exec(row)?.[1] ?? ""));
    const published = normalizeDate(/class="date"[^>]*>\s*([^<]+)/i.exec(row)?.[1] ?? "");
    const cells = cellTexts(row);
    const category = cells.find((cell) => cell && cell !== title && !/^\d+$/.test(cell) && !/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(cell)) ?? "";
    items.push({ id, title, category, published });
  }
  return items;
}

export function parseKoficDetail(html: string): KoficDetail {
  const id = hiddenInput(html, "policyNo");
  const title = collapseWs(hiddenInput(html, "title") || stripTags(/<td\b[^>]*class="subject"[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ?? ""));
  const authors = uniqueAuthors(hiddenInput(html, "author").split(/\s+/));
  const files = [...html.matchAll(/fn_fileDownload\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/gi)].map((match) => ({
    fileUrl: match[1] ?? "",
    fileNm: match[2] ?? "",
    dnFileName: match[3] ?? "",
  }));
  const category = collapseWs(stripTags(/<td\b[^>]*class="subject"[^>]*>\s*<span>([\s\S]*?)<\/span>/i.exec(html)?.[1] ?? ""));
  return {
    id,
    title,
    series: hiddenInput(html, "rptNo"),
    authors,
    published: normalizeDate(hiddenInput(html, "pubDt") || hiddenInput(html, "insDt")),
    pages: hiddenInput(html, "pageCnt"),
    isbn: hiddenInput(html, "isbn"),
    abstract: stripTags(hiddenInput(html, "lblContents")),
    toc: stripTags(hiddenInput(html, "idxContents")),
    category,
    files: files.filter((file) => file.fileNm),
  };
}

function detailUrl(id: string): string {
  return `${DETAIL_URL}?boardNumber=39&policyNo=${encodeURIComponent(id)}`;
}

function hitFromItem(item: KoficListItem): SearchHit {
  return {
    source: "kofic",
    sourceId: `kofic-${item.id}`,
    remoteId: item.id,
    title: item.title,
    url: detailUrl(item.id),
    published: item.published,
    authors: [],
    publisher: "영화진흥위원회",
    keywords: [],
    hasPdf: false,
    abstract: "",
    series: "",
    docType: item.category || "연구보고서",
  };
}

async function postForm(ctx: SourceContext, url: string, body: URLSearchParams, referer?: string): Promise<string> {
  const response = await ctx.http.request({
    url,
    method: "POST",
    headers: browserHeaders({
      "Content-Type": "application/x-www-form-urlencoded",
      ...(referer ? { Referer: referer } : {}),
    }),
    body: body.toString(),
  });
  if (response.status >= 400) {
    throw new LabsidianError(`영화진흥위원회 요청이 실패했습니다 (${response.status}).`);
  }
  return response.text;
}

export const koficSource: SourceModule = {
  id: "kofic",
  label: "영화진흥위원회",
  blurb: "정책연구 게시판의 연구보고서를 제목으로 찾습니다. 첫 페이지만 가져옵니다.",
  requiresKey: false,
  keyHint: "",
  async search(query, ctx) {
    const body = new URLSearchParams({
      boardNumber: "39",
      curPage: "1",
      searchTitle: query,
      searchContent: "",
      categoryList: RESEARCH_CATEGORY,
    });
    const html = await postForm(ctx, LIST_URL, body);
    return parseKoficList(html).map(hitFromItem);
  },
  async load(hit, ctx) {
    const response = await ctx.http.request({
      url: detailUrl(hit.remoteId),
      headers: browserHeaders(),
    });
    if (response.status >= 400) throw new LabsidianError(`상세 페이지를 열지 못했습니다 (${response.status}).`);
    const detail = parseKoficDetail(response.text);
    const next: SearchHit = {
      ...hit,
      title: detail.title || hit.title,
      published: detail.published || hit.published,
      authors: detail.authors,
      series: detail.series,
      abstract: detail.abstract,
      docType: detail.category || hit.docType,
      hasPdf: detail.files.length > 0,
    };
    const attachments: Attachment[] = detail.files.map((file) => ({
      name: file.dnFileName || file.fileNm,
      ref: { fileUrl: file.fileUrl, fileNm: file.fileNm, dnFileName: file.dnFileName || file.fileNm },
    }));
    return { hit: next, abstract: detail.abstract, toc: detail.toc, attachments } satisfies CollectedDocument;
  },
  async download(attachment, ctx, referer) {
    const body = new URLSearchParams({
      fileUrl: attachment.ref.fileUrl ?? "",
      fileNm: attachment.ref.fileNm ?? "",
      dnFileName: attachment.ref.dnFileName ?? attachment.name,
    });
    const response = await ctx.http.request({
      url: DOWNLOAD_URL,
      method: "POST",
      headers: browserHeaders({
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: referer,
      }),
      body: body.toString(),
    });
    if (response.status >= 400) throw new LabsidianError(`PDF를 받지 못했습니다 (${response.status}).`);
    return response.bytes;
  },
};
