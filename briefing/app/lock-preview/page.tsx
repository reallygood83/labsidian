"use client";

import { useEffect, useState } from "react";
import { ResearchCard } from "../../components/ResearchCard";
import type { ResearchNote } from "../../../packages/types/research-note";

export default function LockPreviewPage() {
  const [note, setNote] = useState<ResearchNote | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void fetch("/lock-fixture.json")
      .then((response) => {
        if (!response.ok) {
          setMissing(true);
          return null;
        }
        return response.json() as Promise<ResearchNote>;
      })
      .then((value) => {
        if (value) setNote(value);
      })
      .catch(() => setMissing(true));
  }, []);
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-semibold">잠금 확인</h1>
      <p className="mb-4 text-sm text-lab-text-muted">비밀번호는 이 브라우저 안에서만 확인하고, 서버로 보내지 않아요.</p>
      {missing ? <p>확인용 암호문이 없어요.</p> : null}
      {note ? <ResearchCard note={note} /> : null}
    </main>
  );
}
