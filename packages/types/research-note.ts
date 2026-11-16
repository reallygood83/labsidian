/** Shared note shape for the plugin and the briefing app. */
export interface ResearchNote {
  title: string;
  series: string;
  source: string;
  source_id: string;
  team_id: string;
  type: string;
  publisher: string;
  author: string[];
  published: string;
  url: string;
  pdf_url: string;
  query: string;
  keywords: string[];
  collected: string;
  converter: string;
  convert_warnings: number;
  summary_model: string;
  team_shared: boolean;
  tags: string[];
  summary: string;
  /** Full note body. Large texts are split across research_notes/{id}/chunks. */
  body: string;
  excerpt: string;
  owner_email: string;
  owner_uid: string;
  uploaded_at: string;
  locked: boolean;
  title_hidden: boolean;
  lock_salt: string;
  lock_iterations: number;
  lock_iv: string;
  lock_ciphertext: string;
  locked_chunks: { index: number; iv: string; ciphertext: string }[];
}

export const RESEARCH_NOTE_KEYS = [
  "title",
  "series",
  "source",
  "source_id",
  "type",
  "publisher",
  "author",
  "published",
  "url",
  "pdf_url",
  "query",
  "keywords",
  "collected",
  "converter",
  "convert_warnings",
  "summary_model",
  "team_shared",
  "tags",
] as const;

export type ResearchNoteKey = (typeof RESEARCH_NOTE_KEYS)[number];
