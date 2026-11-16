import type { ResearchNote, ResearchNoteKey } from "../../packages/types/research-note";
import type { FieldToggles } from "../settings";
import { sanitizeFileBase, yamlString } from "../text";

const ALWAYS: ResearchNoteKey[] = ["title", "source", "source_id", "url", "collected"];

export function renderFilename(template: string, note: Pick<ResearchNote, "title" | "series" | "source" | "source_id" | "type" | "published">): string {
  const values: Record<string, string> = {
    title: note.title,
    series: note.series,
    source: note.source,
    date: note.published,
    id: note.source_id,
    type: note.type,
  };
  const rendered = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
  return sanitizeFileBase(rendered.replace(/\s+/g, " "));
}

export function buildMarkdown(note: ResearchNote, body: string, fields: FieldToggles, warningLines: string[]): string {
  const front = frontmatter(note, fields);
  const parts = [front];
  if (note.summary.trim()) {
    parts.push(callout("summary", "AI 요약", note.summary.trim()));
  }
  if (body.trim()) parts.push(body.trim());
  if (fields.convertWarnings && warningLines.length) {
    parts.push(callout("warning", "변환 경고", warningLines.join("\n")));
  }
  const links = [`[${note.title || "페이지 열기"}](${note.url})`];
  if (note.pdf_url) links.push(`[PDF](${note.pdf_url})`);
  parts.push(`## 원문\n\n${links.join(" · ")}`);
  return `${parts.join("\n\n")}\n`;
}

function frontmatter(note: ResearchNote, fields: FieldToggles): string {
  const lines = ["---"];
  const write = (key: ResearchNoteKey, value: string) => {
    if (!enabled(key, fields) && !ALWAYS.includes(key)) return;
    if (value === "" && !ALWAYS.includes(key)) return;
    lines.push(`${key}: ${value}`);
  };
  write("title", yamlString(note.title));
  write("series", yamlString(note.series));
  write("source", yamlString(note.source));
  write("source_id", yamlString(note.source_id));
  if (note.doc_id) lines.push(`doc_id: ${yamlString(note.doc_id)}`);
  write("type", yamlString(note.type));
  write("publisher", yamlString(note.publisher));
  if (enabled("author", fields) && note.author.length) {
    lines.push("author:");
    for (const name of note.author) lines.push(`  - ${yamlString(name)}`);
  }
  write("published", yamlString(note.published));
  write("url", yamlString(note.url));
  write("pdf_url", yamlString(note.pdf_url));
  write("query", yamlString(note.query));
  if (enabled("keywords", fields)) {
    lines.push("keywords:");
    const keywords = note.keywords.length ? note.keywords : note.query ? [note.query] : [];
    for (const keyword of keywords) lines.push(`  - ${yamlString(keyword)}`);
  }
  write("collected", yamlString(note.collected));
  write("converter", yamlString(note.converter));
  if (fields.convertWarnings) lines.push(`convert_warnings: ${note.convert_warnings}`);
  write("summary_model", yamlString(note.summary_model));
  if (fields.teamShared) lines.push(`team_shared: ${note.team_shared ? "true" : "false"}`);
  if (enabled("tags", fields) && note.tags.length) {
    lines.push("tags:");
    for (const tag of note.tags) lines.push(`  - ${yamlString(tag)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function enabled(key: ResearchNoteKey, fields: FieldToggles): boolean {
  switch (key) {
    case "title":
    case "source":
    case "source_id":
    case "url":
    case "collected":
      return true;
    case "series":
      return fields.series;
    case "type":
      return fields.type;
    case "publisher":
      return fields.publisher;
    case "author":
      return fields.author;
    case "published":
      return fields.published;
    case "pdf_url":
      return fields.pdfUrl;
    case "query":
      return fields.query;
    case "keywords":
      return fields.keywords;
    case "converter":
      return fields.converter;
    case "convert_warnings":
      return fields.convertWarnings;
    case "summary_model":
      return fields.summaryModel;
    case "team_shared":
      return fields.teamShared;
    case "tags":
      return fields.tags;
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

function callout(kind: "summary" | "warning", title: string, body: string): string {
  const quoted = body.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  return `> [!${kind}]- ${title}\n${quoted}`;
}
