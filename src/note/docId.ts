import { yamlString } from "../text";

export function markdownWithDocId(markdown: string, docId: string): string {
  const line = `doc_id: ${yamlString(docId)}`;
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || match.index === undefined) return `---\n${line}\n---\n\n${markdown}`;
  const newline = match[0].includes("\r\n") ? "\r\n" : "\n";
  const rows = match[1].split(/\r?\n/).filter((row) => !row.startsWith("doc_id:") && !row.startsWith("owner_email:"));
  rows.push(line);
  const front = `---${newline}${rows.join(newline)}${newline}---`;
  return front + markdown.slice(match.index + match[0].length);
}

export function ownedDocId(notes: readonly { doc_id: string; owner_uid: string; source_id: string }[], uid: string, sourceId: string): string {
  return notes.find((note) => note.owner_uid === uid && note.source_id === sourceId && note.doc_id)?.doc_id ?? "";
}

export function chooseDocId(stored: string, ownerUid: string, myUid: string, fresh: string): string {
  if (stored && ownerUid && ownerUid !== myUid) return fresh;
  return stored || fresh;
}
