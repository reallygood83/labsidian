import { writeFile } from "node:fs/promises";
import { lockResearchNote } from "../packages/shared/lock";
import type { ResearchNote } from "../packages/types/research-note";

const note: ResearchNote = {
  title: "영화 정책 보고서",
  series: "연구",
  source: "kofic",
  source_id: "lock-preview",
  team_id: "alpha",
  type: "report",
  publisher: "영화진흥위원회",
  author: ["김연구"],
  published: "2026-11-05",
  url: "https://example.test/report",
  pdf_url: "",
  query: "영화",
  keywords: ["정책"],
  collected: "2026-11-16",
  converter: "kordoc 4.24.80",
  convert_warnings: 0,
  summary_model: "gemini",
  team_shared: true,
  tags: [],
  summary: "요약이 열렸어요. 비밀번호는 이 브라우저 안에서만 확인해요.",
  body: "열린 본문입니다. 한글과 이모지 🔒가 보여요.",
  excerpt: "",
  owner_email: "owner@example.com",
  owner_uid: "owner",
  uploaded_at: "2026-11-16T00:00:00.000Z",
  locked: false,
  title_hidden: false,
  lock_salt: "",
  lock_iterations: 0,
  lock_iv: "",
  lock_ciphertext: "",
  locked_chunks: [],
};

const locked = await lockResearchNote(note, "labsidian", false);
await writeFile("/workspace/briefing/public/lock-fixture.json", JSON.stringify(locked));
console.log("fixture ready");
