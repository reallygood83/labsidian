import { decodePublicConfig } from "../../packages/shared/team";
import { ResearchCard } from "../components/ResearchCard";
import { loadPublicNotes } from "../lib/notes";
import type { ResearchNote } from "../../packages/types/research-note";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  kofic: "영진위",
  kocca: "콘진원",
  openalex: "OpenAlex",
  kci: "KCI",
  riss: "RISS",
};

export default async function BriefingPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const params = await searchParams;
  const config = readConfig();
  if (!config) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">주간 브리핑</h1>
        <p className="mt-3 text-lab-text-muted">환경 변수 NEXT_PUBLIC_LABSIDIAN_CONFIG에 플러그인에서 복사한 배포용 값을 넣으면 최근 7일을 보여 줘요. 서비스 계정 키는 쓰지 않아요.</p>
      </main>
    );
  }
  const { projectId, apiKey } = config;
  let notes: ResearchNote[] = [];
  let error = "";
  try {
    notes = await loadPublicNotes(projectId, apiKey, { mode: config.mode, teamId: config.teamId, ownerUid: config.ownerUid });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "브리핑을 읽지 못했어요.";
  }
  const now = Date.now();
  const week = notes.filter((note) => within(note.uploaded_at || note.collected, now, 7));
  const previous = notes.filter((note) => {
    const age = ageDays(note.uploaded_at || note.collected, now);
    return age > 7 && age <= 14;
  });
  const selected = params.source ? week.filter((note) => note.source === params.source) : week;
  const sources = [...new Set(week.map((note) => note.source))];
  const keywords = top(week.flatMap((note) => note.keywords));
  const people = top(week.map((note) => note.display_name).filter(Boolean));
  const delta = week.length - previous.length;
  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 min-[900px]:grid-cols-[1fr_300px]">
      <section>
        <header className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-lab-text-muted">Research Shelf</p>
            <h1 className="text-2xl font-semibold">주간 브리핑 · {rangeLabel(now)}</h1>
            <p className="text-sm text-lab-text-muted">생성 {kstStamp(now)} KST. 로그인 없이 볼 수 있어요.</p>
          </div>
        </header>
        {error ? <p className="mb-4 rounded-lab-m border border-lab-border p-3">{error}</p> : null}
        <div className="mb-4 grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
          <Stat label="새 자료" value={`${week.length}건`} />
          <Stat label="AI 요약 있음" value={`${week.filter((note) => note.summary.trim().length > 0).length}건`} />
          <Stat label="기관 수" value={`${sources.length}곳`} />
          <Stat label="지난주 대비" value={`${delta > 0 ? "+" : ""}${delta}건`} />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Filter href="/" current={!params.source} label="전체" />
          {sources.map((source) => (
            <Filter key={source} href={`/?source=${source}`} current={params.source === source} label={LABELS[source] ?? source} />
          ))}
        </div>
        {sources.map((source) => {
          const group = selected.filter((note) => note.source === source);
          if (!group.length) return null;
          return (
            <section key={source} className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">{LABELS[source] ?? source}</h2>
              <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                {group.map((note) => (
                  <ResearchCard key={note.doc_id || note.source_id} note={note} />
                ))}
              </div>
            </section>
          );
        })}
        {!week.length && !error ? <p>최근 7일에 올라온 자료가 없어요.</p> : null}
      </section>
      <aside className="rounded-lab-l border border-lab-border p-4">
        <h2 className="font-semibold">키워드</h2>
        <ul className="mt-2 text-sm text-lab-text-muted">
          {keywords.map((item) => (
            <li key={item.name}>{item.name} {item.count}건</li>
          ))}
        </ul>
        <h2 className="mt-6 font-semibold">많이 올린 팀원</h2>
        <ul className="mt-2 text-sm text-lab-text-muted">
          {people.map((item) => (
            <li key={item.name}>{item.name} {item.count}건</li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

function readConfig() {
  const raw = process.env.NEXT_PUBLIC_LABSIDIAN_CONFIG ?? "";
  if (!raw) return null;
  try {
    return decodePublicConfig(raw);
  } catch {
    return null;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lab-l border border-lab-border p-3">
      <p className="text-xs text-lab-text-muted">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function Filter({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <a className={`rounded-lab-pill border px-3 py-1 text-sm ${current ? "border-lab-accent bg-lab-accent text-lab-on-accent" : "border-lab-border"}`} href={href}>
      {label}
    </a>
  );
}

function within(value: string, now: number, days: number): boolean {
  const age = ageDays(value, now);
  return age >= 0 && age <= days;
}

function ageDays(value: string, now: number): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 99;
  return (now - time) / 86_400_000;
}

function rangeLabel(now: number): string {
  const end = new Date(now);
  const start = new Date(now - 6 * 86_400_000);
  return `${dot(start)}–${dot(end)}`;
}

function dot(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts.replace(/-/g, ".");
}

function kstStamp(now: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

function top(values: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
}
