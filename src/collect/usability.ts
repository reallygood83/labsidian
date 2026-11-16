export interface SavedIdentity {
  sourceId: string;
  doi: string;
  url: string;
  path: string;
}

export interface IdentityHit {
  sourceId: string;
  doi?: string;
  url: string;
}

export function previewLines(abstract: string, limit = 3): string {
  const lines = abstract
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, limit).join("\n");
}

export function yearOf(published: string): string {
  const match = /^(\d{4})/.exec(published.trim());
  return match?.[1] ?? "";
}

export function findDuplicate(hit: IdentityHit, saved: readonly SavedIdentity[]): SavedIdentity | null {
  const doi = normalize(hit.doi);
  const url = normalize(hit.url);
  return saved.find((item) => {
    if (hit.sourceId && item.sourceId === hit.sourceId) return true;
    if (doi && normalize(item.doi) === doi) return true;
    if (url && normalize(item.url) === url) return true;
    return false;
  }) ?? null;
}

export function saveButtonLabel(count: number): string {
  return `선택한 ${count}개 저장`;
}

export function batchSummary(saved: number, failed: number, already = 0): string {
  const parts = [`${saved}개를 저장했어요.`];
  if (already > 0) parts.push(`${already}개는 이미 있어서 건너뛰었어요.`);
  if (failed > 0) parts.push(`${failed}개는 실패해서 건너뛰었어요.`);
  return parts.join(" ");
}

export const TOUR_STEPS = [
  { title: "예시 검색", body: "에디터에서 고른 문장으로 자료를 찾아요." },
  { title: "미리보기", body: "초록 앞부분, 출처, 연도, PDF 여부를 먼저 봐요." },
  { title: "저장", body: "고른 자료를 한 번에 노트로 저장해요." },
  { title: "열기", body: "저장된 노트를 바로 열어요. 이미 있는 자료는 다시 저장하지 않아요." },
] as const;

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/$/, "").toLowerCase();
}
