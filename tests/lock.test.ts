import { describe, expect, it } from "vitest";
import { fromBase64, HIDDEN_TITLE, lockResearchNote, MAX_PBKDF2_ITERATIONS, openSealed, sealNote, toBase64, unlockResearchNote } from "../packages/shared/lock";
import { toFirestoreFields } from "../src/team/firestore";
import type { ResearchNote } from "../packages/types/research-note";

const password = "올바른-비밀번호";
const title = "평문제목-한글-연구보고서";
const summary = "평문요약-핵심만-골라요";
const body = "평문본문-한글과 이모지 🔒📄 가 그대로 남아요.";
const keyword = "평문키워드";

function sealInput(hideTitle = false) {
  return {
    title,
    summary,
    keywords: [keyword],
    body,
    password,
    hideTitle,
    docId: "doc-lock-1",
    sourceId: "kofic-lock-1",
    publisher: "영화진흥위원회",
    url: "https://example.test/report",
    pdfUrl: "https://example.test/file.pdf",
    author: ["김연구"],
    query: "영화",
    tags: ["정책"],
  };
}

function note(extra: Partial<ResearchNote> = {}): ResearchNote {
  return {
    title,
    series: "보고서",
    source: "kofic",
    source_id: "kofic-lock-1",
    doc_id: "",
    team_id: "alpha",
    type: "report",
    publisher: "영화진흥위원회",
    author: ["김연구"],
    published: "2026-11-05",
    url: "https://example.test/report",
    pdf_url: "",
    query: "영화",
    keywords: [keyword],
    collected: "2026-11-16",
    converter: "kordoc 4.24.80",
    convert_warnings: 0,
    summary_model: "gemini",
    team_shared: true,
    briefing_public: false,
    display_name: "표시이름",
    tags: [],
    summary,
    body,
    excerpt: summary,
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
    ...extra,
  };
}

describe("note lock", () => {
  it("decrypts back to the same text, including Korean and emoji", async () => {
    const sealed = await sealNote(sealInput());
    const opened = await openSealed(sealed, password);
    expect(opened.title).toBe(title);
    expect(opened.body).toBe(body);
    expect(opened.source_id).toBe("kofic-lock-1");
    expect(opened.publisher).toBe("영화진흥위원회");
    expect(opened.url).toBe("https://example.test/report");
  }, 30_000);

  it("rejects an iteration count outside the allowed range before deriving a key", async () => {
    const sealed = await sealNote(sealInput());
    await expect(openSealed({ ...sealed, iterations: MAX_PBKDF2_ITERATIONS + 1 }, password)).rejects.toThrow("잠금 설정을 열 수 없어요.");
    await expect(openSealed({ ...sealed, iterations: 1 }, password)).rejects.toThrow("잠금 설정을 열 수 없어요.");
    await expect(openSealed({ ...sealed, iterations: Number.NaN }, password)).rejects.toThrow("잠금 설정을 열 수 없어요.");
  }, 10_000);

  it("rejects a wrong password", async () => {
    const sealed = await sealNote(sealInput());
    await expect(openSealed(sealed, "틀린-비밀번호")).rejects.toThrow("비밀번호가 맞지 않아요");
  }, 30_000);

  it("rejects a ciphertext changed by one byte", async () => {
    const sealed = await sealNote(sealInput());
    const bytes = fromBase64(sealed.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { ...sealed, ciphertext: toBase64(bytes) };
    await expect(openSealed(tampered, password)).rejects.toThrow("비밀번호가 맞지 않아요");
  }, 30_000);

  it("uses a new IV and ciphertext every time", async () => {
    const first = await sealNote(sealInput());
    const second = await sealNote(sealInput());
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.salt).not.toBe(second.salt);
  }, 40_000);

  it("hides the title and keeps plaintext out of the stored JSON", async () => {
    const locked = await lockResearchNote(note(), password, true);
    expect(locked.title).toBe(HIDDEN_TITLE);
    expect(locked.summary).toBe("");
    expect(locked.body).toBe("");
    expect(locked.keywords).toEqual([]);
    expect(locked.excerpt).toBe("");
    const stored = JSON.stringify({ ...locked, ...toFirestoreFields(locked, locked.locked_chunks.length) });
    for (const secret of [title, summary, body, keyword, "kofic-lock-1", "https://example.test/report", "김연구", "영화진흥위원회"]) {
      expect(stored.includes(secret)).toBe(false);
    }
    const opened = await unlockResearchNote(locked, password);
    expect(opened.title).toBe(title);
    expect(opened.summary).toBe(summary);
    expect(opened.body).toBe(body);
    expect(opened.keywords).toEqual([keyword]);
  }, 40_000);

  it("encrypts a body larger than 1MB into chunks without leaving plaintext", async () => {
    const marker = "큰본문표식-한글-🔒";
    const large = `${marker}${"가".repeat(400_000)}`;
    expect(new TextEncoder().encode(large).byteLength).toBeGreaterThan(1_000_000);
    const locked = await lockResearchNote(note({ body: large, summary, title }), password, true);
    expect(locked.body).toBe("");
    expect(locked.locked_chunks.length).toBeGreaterThan(1);
    const stored = JSON.stringify(locked);
    expect(stored.includes(marker)).toBe(false);
    expect(stored.includes(summary)).toBe(false);
    expect(stored.includes(title)).toBe(false);
    const opened = await unlockResearchNote(locked, password);
    expect(opened.body).toBe(large);
  }, 60_000);
});
