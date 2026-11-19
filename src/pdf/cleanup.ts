export interface CleanupResult {
  markdown: string;
  removedHeaders: number;
  joinedBreaks: number;
  removedImages: number;
  warnings: string[];
}

const PARTICLE =
  /(습니다|입니다|합니다|됩니다|있습니다|없습니다|했습니다|였다|한다|된다|부터|까지|에서|에게|한테|라고|이고|이며|이나|거나|은|는|이|가|을|를|와|과|의|도|만|에|로|께|며|고|서|면|데|요|까|지|군|네|함|됨|임|음|다)$/;

const BREAK = "\u0001";
const SOFT = "\u0002";

export function cleanConvertedMarkdown(markdown: string, hint?: { title?: string; keepImages?: ReadonlySet<string> }): CleanupResult {
  const title = hint?.title?.replace(/\s+/g, " ").trim() ?? "";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let removedHeaders = 0;
  const marked: string[] = [];
  for (const line of lines) {
    if (isFurniture(line, title)) {
      removedHeaders += 1;
      if (marked[marked.length - 1] !== BREAK) marked.push(BREAK);
      continue;
    }
    if (line.trim() === "") {
      const last = marked[marked.length - 1];
      if (last !== SOFT && last !== BREAK) marked.push(SOFT);
      continue;
    }
    marked.push(line.replace(/[\uE000-\uF8FF]/g, ""));
  }
  const images = stripLocalImages(marked.join("\n"), hint?.keepImages);
  const rejoined = joinAcrossBreaks(images.markdown);
  const collapsed = rejoined.markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const warnings: string[] = [];
  if (removedHeaders) warnings.push(`쪽 머리말 ${removedHeaders}줄을 뺐어요.`);
  if (rejoined.joined) warnings.push(`쪽에서 끊긴 문장 ${rejoined.joined}곳을 이었어요.`);
  if (images.removed) warnings.push(`볼트에 없는 그림 ${images.removed}개를 뺐어요.`);
  return {
    markdown: collapsed,
    removedHeaders,
    joinedBreaks: rejoined.joined,
    removedImages: images.removed,
    warnings,
  };
}

function isFurniture(line: string, title: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  if (/^[\uE000-\uF8FF\s\t]+$/.test(trimmed)) return true;
  if (/^\d{1,3}$/.test(trimmed)) return true;
  const text = trimmed.replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim();
  if (/[\uE000-\uF8FF]/.test(trimmed) && text.length > 0 && text.length <= 80) return true;
  if (title && text === title) return true;
  return false;
}

function stripLocalImages(markdown: string, keep?: ReadonlySet<string>): { markdown: string; removed: number } {
  let removed = 0;
  const next = markdown.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (full, dest: string) => {
    if (/^https?:\/\//i.test(dest.trim())) return full;
    // Pictures we save into the vault keep their place; the note writer points them at the file.
    if (keep?.has(dest.trim())) return `\n${full}\n`;
    removed += 1;
    return "";
  });
  return { markdown: next, removed };
}

function joinAcrossBreaks(text: string): { markdown: string; joined: number } {
  const lines = text.split("\n");
  const out: string[] = [];
  let joined = 0;
  for (const line of lines) {
    if (line === BREAK || line === SOFT) {
      const last = out[out.length - 1];
      if (last !== BREAK && last !== SOFT) out.push(line);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev === BREAK || prev === SOFT) {
      const left = out.length >= 2 ? (out[out.length - 2] ?? "") : "";
      if (left.trim() && line.trim() && canJoin(left, line)) {
        out.splice(out.length - 2, 2, joinPair(left.trimEnd(), line.trim()));
        joined += 1;
        continue;
      }
      out[out.length - 1] = "";
    }
    out.push(line);
  }
  return { markdown: out.filter((line) => line !== BREAK && line !== SOFT).join("\n"), joined };
}

function canJoin(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (/[.!?…。]$/.test(a)) return false;
  if (/^(#{1,6}\s|[-*•◦]\s|\d+\.\s|\|)/.test(b)) return false;
  if (/^(\*\*|제\d+장|[가-하]\.\s|표\s*\d+|그림\s*\d+|<표|<그림)/.test(b)) return false;
  if (a.includes("|") || b.startsWith("|")) return false;
  return /[가-힣)]$/.test(a) && /^[가-힣(]/.test(b);
}

function joinPair(left: string, right: string): string {
  if (right.startsWith("(")) return left + right;
  const token = left.split(/\s+/).pop() ?? "";
  const hangul = token.match(/[가-힣]+$/)?.[0] ?? "";
  const glue = hangul.length > 0 && hangul.length <= 2 && !PARTICLE.test(hangul) ? "" : " ";
  return `${left}${glue}${right}`;
}
