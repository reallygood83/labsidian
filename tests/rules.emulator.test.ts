import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lockResearchNote } from "../packages/shared/lock";
import { hashTeamCode } from "../packages/shared/team";
import type { ResearchNote } from "../packages/types/research-note";
import { toFirestoreFields } from "../src/team/firestore";

let env: RulesTestEnvironment;
const code = "CODE99";
let codeHash = "";

beforeAll(async () => {
  codeHash = await hashTeamCode(code);
  env = await initializeTestEnvironment({
    projectId: "demo-labsidian",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe("firestore team rules", () => {
  it("lets a person join with the team code and rejects a wrong code", async () => {
    const owner = env.authenticatedContext("owner");
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha"), { ownerUid: "owner", codeHash }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha/members/owner"), { codeHash, email: "owner@example.com" }));
    const stranger = env.authenticatedContext("stranger");
    await assertFails(setDoc(doc(stranger.firestore(), "teams/alpha/members/stranger"), { codeHash: "0".repeat(64), email: "no@example.com" }));
    await assertSucceeds(setDoc(doc(stranger.firestore(), "teams/alpha/members/stranger"), { codeHash, email: "ok@example.com" }));
  });

  it("rejects writes from someone who has not joined and allows public reads", async () => {
    const owner = env.authenticatedContext("owner");
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha"), { ownerUid: "owner", codeHash }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha/members/owner"), { codeHash, email: "owner@example.com" }));
    const note = { team_id: "alpha", owner_uid: "owner", title: "공개 제목", body: "" };
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/note1"), note));
    const outsider = env.authenticatedContext("outsider");
    await assertFails(setDoc(doc(outsider.firestore(), "research_notes/note2"), { ...note, owner_uid: "outsider" }));
    const guest = env.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(guest.firestore(), "research_notes/note1")));
    await assertFails(setDoc(doc(guest.firestore(), "research_notes/note3"), note));
    await assertSucceeds(deleteDoc(doc(owner.firestore(), "teams/alpha/members/owner")));
  });

  it("stores a locked upload without plaintext in the note or its chunks", async () => {
    const title = "잠금제목-평문-보고서";
    const summary = "잠금요약-평문-문장";
    const marker = "잠금본문-평문-한글-🔒-표식";
    const source: ResearchNote = {
      title,
      series: "",
      source: "kofic",
      source_id: "locked-note",
      team_id: "alpha",
      type: "report",
      publisher: "영화진흥위원회",
      author: [],
      published: "2026-11-05",
      url: "https://example.test/locked",
      pdf_url: "",
      query: "",
      keywords: ["평문키워드"],
      collected: "2026-11-16",
      converter: "kordoc 4.24.80",
      convert_warnings: 0,
      summary_model: "",
      team_shared: true,
      tags: [],
      summary,
      body: `${marker}${"가".repeat(400_000)}`,
      excerpt: summary,
      owner_email: "owner@example.com",
      owner_uid: "owner",
      uploaded_at: "",
      locked: false,
      title_hidden: false,
      lock_salt: "",
      lock_iterations: 0,
      lock_iv: "",
      lock_ciphertext: "",
      locked_chunks: [],
    };
    const locked = await lockResearchNote(source, "team-password", true);
    const owner = env.authenticatedContext("owner");
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha"), { ownerUid: "owner", codeHash }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha/members/owner"), { codeHash, email: "owner@example.com" }));
    const parent = plainFields(toFirestoreFields(locked, locked.locked_chunks.length).fields);
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/locked-note"), parent));
    for (const chunk of locked.locked_chunks) {
      const id = String(chunk.index).padStart(4, "0");
      await assertSucceeds(setDoc(doc(owner.firestore(), `research_notes/locked-note/chunks/${id}`), {
        index: chunk.index,
        iv: chunk.iv,
        ciphertext: chunk.ciphertext,
        text: "",
      }));
    }
    const saved = await getDoc(doc(owner.firestore(), "research_notes/locked-note"));
    const raw = JSON.stringify(saved.data());
    expect(raw.includes(title)).toBe(false);
    expect(raw.includes(summary)).toBe(false);
    expect(raw.includes(marker)).toBe(false);
    expect(raw.includes("평문키워드")).toBe(false);
    for (const chunk of locked.locked_chunks) {
      const id = String(chunk.index).padStart(4, "0");
      const piece = await getDoc(doc(owner.firestore(), `research_notes/locked-note/chunks/${id}`));
      const text = JSON.stringify(piece.data());
      expect(text.includes(marker)).toBe(false);
      expect(piece.data()?.text).toBe("");
    }
  }, 60_000);

  it("lets only the owner change the password or remove the lock", async () => {
    const owner = env.authenticatedContext("owner");
    const mate = env.authenticatedContext("mate");
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha"), { ownerUid: "owner", codeHash }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/alpha/members/owner"), { codeHash, email: "owner@example.com" }));
    await assertSucceeds(setDoc(doc(mate.firestore(), "teams/alpha/members/mate"), { codeHash, email: "mate@example.com" }));
    const note = doc(owner.firestore(), "research_notes/owned");
    await assertSucceeds(setDoc(note, {
      team_id: "alpha",
      owner_uid: "owner",
      title: "잠긴 자료",
      body: "",
      summary: "",
      locked: true,
      lock_ciphertext: "cipher-a",
    }));
    await assertSucceeds(updateDoc(note, { lock_ciphertext: "cipher-b" }));
    const mateNote = doc(mate.firestore(), "research_notes/owned");
    await assertFails(updateDoc(mateNote, { lock_ciphertext: "cipher-stolen" }));
    await assertFails(updateDoc(mateNote, { locked: false, body: "남의 본문", summary: "남의 요약" }));
    await assertFails(deleteDoc(mateNote));
    await assertSucceeds(updateDoc(note, { locked: false, body: "복원된 본문", summary: "복원된 요약", lock_ciphertext: "" }));
  });
});

function plainFields(fields: Record<string, { stringValue?: string; booleanValue?: boolean; integerValue?: string; arrayValue?: { values?: { stringValue: string }[] }; timestampValue?: string }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if ("stringValue" in value && value.stringValue !== undefined) out[key] = value.stringValue;
    else if ("booleanValue" in value && value.booleanValue !== undefined) out[key] = value.booleanValue;
    else if ("integerValue" in value && value.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if ("timestampValue" in value && value.timestampValue !== undefined) out[key] = value.timestampValue;
    else if ("arrayValue" in value) out[key] = (value.arrayValue?.values ?? []).map((item) => item.stringValue);
  }
  return out;
}
