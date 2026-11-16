"use client";

import { useEffect, useState } from "react";
import { unlockResearchNote } from "../../packages/shared/lock";
import type { ResearchNote } from "../../packages/types/research-note";
import { OpenInObsidian } from "./OpenInObsidian";

const storageKey = (id: string) => `labsidian-open:${id}`;

export function ResearchCard({ note }: { note: ResearchNote }) {
  const [opened, setOpened] = useState<ResearchNote | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey(note.source_id));
    if (!saved) return;
    try {
      setOpened(JSON.parse(saved) as ResearchNote);
    } catch {
      sessionStorage.removeItem(storageKey(note.source_id));
    }
  }, [note.source_id]);

  const shown = opened ?? note;
  async function unlock(): Promise<void> {
    setError("");
    try {
      const next = await unlockResearchNote(note, password);
      sessionStorage.setItem(storageKey(note.source_id), JSON.stringify(next));
      setOpened(next);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "비밀번호가 맞지 않아요");
    }
  }

  return (
    <article data-locked-card={note.locked ? "true" : "false"} className="rounded-lab-l border border-lab-border bg-lab-bg-subtle p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-lab-text-muted">
        <span>{shown.publisher || shown.source}</span>
        <span>{dotDate(shown.published)}</span>
        {note.locked && !opened ? <span>잠김</span> : null}
      </div>
      <h3 className="text-base font-semibold">{shown.title}</h3>
      {shown.summary ? <p className="mt-2 line-clamp-2 text-sm text-lab-text-muted">{shown.summary}</p> : null}
      {opened?.body ? <p className="mt-3 whitespace-pre-wrap text-sm">{opened.body}</p> : null}
      {note.locked && !opened ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <label className="text-sm">
            비밀번호
            <input
              aria-label="비밀번호"
              className="mt-1 w-full rounded-lab-m border border-lab-border bg-lab-bg px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="rounded-lab-m bg-lab-accent px-3 py-2 text-sm font-medium text-lab-on-accent" type="submit">
            비밀번호로 열기
          </button>
          {error ? <p className="text-sm text-lab-danger">{error}</p> : null}
        </form>
      ) : null}
      <div className="mt-3 flex gap-3">
        {shown.url ? (
          <a className="text-sm" href={shown.url} target="_blank" rel="noreferrer">
            원문 ↗
          </a>
        ) : null}
        <OpenInObsidian sourceId={note.source_id} />
      </div>
      {shown.owner_email ? <p className="mt-2 text-xs text-lab-text-faint">{shown.owner_email}</p> : null}
    </article>
  );
}

function dotDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}
