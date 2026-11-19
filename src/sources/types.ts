import type { HttpClient } from "../http/types";

export type SourceId = "kofic" | "kocca" | "openalex" | "kci" | "riss";

export const SOURCE_IDS: readonly SourceId[] = ["kofic", "kocca", "openalex", "kci", "riss"];

export interface SearchHit {
  source: SourceId;
  sourceId: string;
  remoteId: string;
  title: string;
  url: string;
  doi?: string;
  published: string;
  authors: string[];
  publisher: string;
  keywords: string[];
  hasPdf: boolean;
  abstract: string;
  series: string;
  docType: string;
  /** Direct PDF link when the search result already knows it (OpenAlex). */
  pdfUrl?: string;
}

export interface Attachment {
  name: string;
  ref: Record<string, string>;
}

export interface CollectedDocument {
  hit: SearchHit;
  abstract: string;
  toc: string;
  attachments: Attachment[];
}

export interface SourceContext {
  http: HttpClient;
  keys: Partial<Record<SourceId, string>>;
  openalexMailto: string;
}

export interface SourceModule {
  id: SourceId;
  label: string;
  blurb: string;
  requiresKey: boolean;
  keyHint: string;
  search(query: string, ctx: SourceContext): Promise<SearchHit[]>;
  load(hit: SearchHit, ctx: SourceContext): Promise<CollectedDocument>;
  download(attachment: Attachment, ctx: SourceContext, referer: string): Promise<Uint8Array>;
}

export interface SearchGroup {
  source: SourceId;
  label: string;
  hits: SearchHit[];
  error?: string;
}

export function isSourceId(value: string): value is SourceId {
  return SOURCE_IDS.some((id) => id === value);
}

export function sourceLabel(id: SourceId): string {
  switch (id) {
    case "kofic":
      return "영화진흥위원회";
    case "kocca":
      return "한국콘텐츠진흥원";
    case "openalex":
      return "OpenAlex";
    case "kci":
      return "KCI";
    case "riss":
      return "RISS";
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
