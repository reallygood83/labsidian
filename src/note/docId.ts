import { yamlString } from "../text";

export function markdownWithDocId(markdown: string, docId: string): string {
  const line = `doc_id: ${yamlString(docId)}`;
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return `---\n${line}\n---\n\n${markdown}`;
  const newline = match[0].includes("\r\n") ? "\r\n" : "\n";
  const rows = match[1].split(/\r?\n/).filter((row) => !row.startsWith("doc_id:") && !row.startsWith("owner_email:"));
  rows.push(line);
  return markdown.replace(match[0], `---${newline}${rows.join(newline)}${newline}---`);
}
