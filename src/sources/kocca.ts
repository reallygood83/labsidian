import { LabsidianError } from "../errors";
import { browserHeaders } from "../http/types";
import { collapseWs, normalizeDate, stripTags } from "../text";
import { rows } from "./html";
import type { Attachment, CollectedDocument, SearchHit, SourceModule } from "./types";

const LIST_URL = "https://www.kocca.kr/kocca/bbs/list/B0000147.do";
const DOWNLOAD_URL = "https://www.kocca.kr/common/cmm/fms/FileDown.do";

export interface KoccaListItem {
  id: string;
  title: string;
  published: string;
  hasFile: boolean;
}

export interface KoccaFile {
  atchFileId: string;
  fileSn: string;
  name: string;
}

export interface KoccaDetail {
  id: string;
  title: string;
  published: string;
  abstract: string;
  files: KoccaFile[];
}

export function parseKoccaList(html: string): KoccaListItem[] {
  const items: KoccaListItem[] = [];
  for (const row of rows(html)) {
    const match = /\/kocca\/bbs\/view\/B0000147\/(\d+)\.do/.exec(row);
    if (!match?.[1]) continue;
    const title = collapseWs(stripTags(/\/kocca\/bbs\/view\/B0000147\/\d+\.do[^"]*">\s*([\s\S]*?)<\/a>/i.exec(row)?.[1] ?? ""));
    const published = normalizeDate(/data-label="등록일"[^>]*>\s*([^<]+)/i.exec(row)?.[1] ?? "");
    items.push({
      id: match[1],
      title,
      published,
      hasFile: row.includes("첨부파일 있음"),
    });
  }
  return items;
}

export function parseKoccaDetail(html: string, fallbackId = ""): KoccaDetail {
  const id = /name="nttId"\s+value="(\d+)"/i.exec(html)?.[1] ?? fallbackId;
  const title = collapseWs(stripTags(/<div class="board_title">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? ""));
  const published = normalizeDate(/등록일<\/strong>\s*<span>([^<]+)<\/span>/i.exec(html)?.[1] ?? "");
  const abstract = stripTags(/<div class="board_cont">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? "");
  const files: KoccaFile[] = [];
  const pattern = /<a\b[^>]*onclick="fileDown\('([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    files.push({
      atchFileId: match[1] ?? "",
      fileSn: match[2] ?? "",
      name: collapseWs(stripTags(match[4] ?? "")) || `첨부 ${match[2]}`,
    });
  }
  return { id, title, published, abstract, files };
}

function detailUrl(id: string): string {
  return `https://www.kocca.kr/kocca/bbs/view/B0000147/${encodeURIComponent(id)}.do?menuNo=204153`;
}

export const koccaSource: SourceModule = {
  id: "kocca",
  label: "한국콘텐츠진흥원",
  blurb: "연구보고서 게시판을 제목으로 찾습니다. 첨부가 여러 개면 저장 전에 고릅니다.",
  requiresKey: false,
  keyHint: "",
  async search(query, ctx) {
    const url = `${LIST_URL}?menuNo=204153&searchCnd=1&searchWrd=${encodeURIComponent(query)}&pageIndex=1`;
    const response = await ctx.http.request({ url, headers: browserHeaders() });
    if (response.status >= 400) throw new LabsidianError(`한국콘텐츠진흥원 요청이 실패했습니다 (${response.status}).`);
    return parseKoccaList(response.text).map((item) => ({
      source: "kocca" as const,
      sourceId: `kocca-${item.id}`,
      remoteId: item.id,
      title: item.title,
      url: detailUrl(item.id),
      published: item.published,
      authors: [],
      publisher: "한국콘텐츠진흥원",
      keywords: [],
      hasPdf: item.hasFile,
      abstract: "",
      series: "",
      docType: "연구보고서",
    }));
  },
  async load(hit, ctx) {
    const response = await ctx.http.request({ url: detailUrl(hit.remoteId), headers: browserHeaders() });
    if (response.status >= 400) throw new LabsidianError(`상세 페이지를 열지 못했습니다 (${response.status}).`);
    const detail = parseKoccaDetail(response.text, hit.remoteId);
    const next: SearchHit = {
      ...hit,
      title: detail.title || hit.title,
      published: detail.published || hit.published,
      abstract: detail.abstract,
      hasPdf: detail.files.length > 0,
    };
    const attachments: Attachment[] = detail.files.map((file) => ({
      name: file.name,
      ref: { atchFileId: file.atchFileId, fileSn: file.fileSn },
    }));
    return { hit: next, abstract: detail.abstract, toc: "", attachments } satisfies CollectedDocument;
  },
  async download(attachment, ctx, referer) {
    const body = new URLSearchParams({
      atchFileId: attachment.ref.atchFileId ?? "",
      fileSn: attachment.ref.fileSn ?? "",
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
