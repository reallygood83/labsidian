import type { ResearchNote } from "../../packages/types/research-note";
import { buildMarkdown, renderFilename } from "../note/build";
import type { LabsidianSettings } from "../settings";
import type { SearchHit } from "../sources/types";
import { localIsoDate, yamlString } from "../text";

export interface MadeNote {
  note: ResearchNote;
  markdown: string;
  filename: string;
  folder: string;
}

export function makeNote(input: {
  hit: SearchHit;
  query: string;
  settings: LabsidianSettings;
  collectedAt: Date;
  body: string;
  pdfUrl: string;
  warnings: string[];
  summary: string;
  summaryModel: string;
  converter: string;
  toc: string;
}): MadeNote {
  const keywords = input.hit.keywords.length ? input.hit.keywords : input.query ? [input.query] : [];
  const tags = ["research", input.hit.source, ...input.settings.extraTags.split(/[,#]/).map((tag) => tag.trim()).filter(Boolean)];
  const sections = [
    input.hit.abstract ? `## 초록\n\n${input.hit.abstract}` : "",
    input.toc ? `## 목차\n\n${input.toc}` : "",
    input.body ? `## 본문\n\n${input.body}` : "",
  ].filter(Boolean);
  const body = sections.join("\n\n");
  const note: ResearchNote = {
    title: input.hit.title,
    series: input.hit.series,
    source: input.hit.source,
    source_id: input.hit.sourceId,
    doc_id: "",
    team_id: "",
    type: input.hit.docType,
    publisher: input.hit.publisher,
    author: input.hit.authors,
    published: input.hit.published,
    url: input.hit.url,
    pdf_url: input.pdfUrl,
    query: input.query,
    keywords,
    collected: localIsoDate(input.collectedAt),
    converter: input.converter,
    convert_warnings: input.warnings.length,
    summary_model: input.summaryModel,
    team_shared: false,
    briefing_public: false,
    tags,
    summary: input.summary,
    body,
    excerpt: "",
    owner_email: "",
    display_name: "",
    owner_uid: "",
    uploaded_at: "",
    locked: false,
    title_hidden: false,
    lock_salt: "",
    lock_iterations: 0,
    lock_iv: "",
    lock_ciphertext: "",
    locked_chunks: [],
  };
  let markdown = buildMarkdown(note, body, input.settings.fields, input.warnings);
  if (input.hit.doi) markdown = markdown.replace(/^---\r?\n/, `---\ndoi: ${yamlString(input.hit.doi)}\n`);
  return {
    note,
    markdown,
    filename: renderFilename(input.settings.filenameTemplate, note),
    folder: input.settings.noteFolder.replace(/^\/+|\/+$/g, ""),
  };
}
