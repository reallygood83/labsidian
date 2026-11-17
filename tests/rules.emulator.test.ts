import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lockResearchNote, unlockResearchNote } from "../packages/shared/lock";
import type { ResearchNote } from "../packages/types/research-note";

let env: RulesTestEnvironment;
const ownerId = "owneruser";
const otherId = "otheruser";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-labsidian",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8").replaceAll("__LABSIDIAN_ADMIN_UID__", ownerId),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

function user(uid: string, email: string, verified = true) {
  return env.authenticatedContext(uid, { email, email_verified: verified });
}

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

function note(extra: Record<string, unknown> = {}) {
  return {
    title: "내 노트",
    team_id: ownerId,
    owner_uid: ownerId,
    display_name: "김연구",
    briefing_public: false,
    body: "",
    summary: "",
    locked: false,
    ...extra,
  };
}

async function personalLibrary() {
  const owner = user(ownerId, "owner@example.com");
  await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId: ownerId, mode: "personal" }));
  await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/private"), note()));
  await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/public"), note({ briefing_public: true, title: "공개 글" })));
  return owner;
}

describe("personal library rules", () => {
  it("blocks another uid from reading or writing", async () => {
    await personalLibrary();
    const other = user(otherId, "other@example.com");
    await assertFails(getDoc(doc(other.firestore(), "research_notes/private")));
    await assertFails(setDoc(doc(other.firestore(), "research_notes/stolen"), note({ owner_uid: otherId, display_name: "외부" })));
  });

  it("rejects a signed-in account that has not verified its email", async () => {
    await personalLibrary();
    const unverified = user(ownerId, "owner@example.com", false);
    await assertFails(setDoc(doc(unverified.firestore(), "research_notes/unverified"), note()));
  });

  it("lets the owner delete their own note", async () => {
    const owner = await personalLibrary();
    await assertSucceeds(deleteDoc(doc(owner.firestore(), "research_notes/private")));
  });

  it("shows only public notes to the briefing", async () => {
    await personalLibrary();
    const guest = env.unauthenticatedContext();
    await assertFails(getDoc(doc(guest.firestore(), "research_notes/private")));
    await assertSucceeds(getDoc(doc(guest.firestore(), "research_notes/public")));
    await assertFails(getDocs(collection(guest.firestore(), "research_notes")));
    const visible = await getDocs(query(
      collection(guest.firestore(), "research_notes"),
      where("owner_uid", "==", ownerId),
      where("briefing_public", "==", true),
    ));
    expect(visible.docs.map((item) => item.id)).toEqual(["public"]);
  });

  it("keeps a locked note openable after changing only the team id", async () => {
    const owner = user(ownerId, "owner@example.com");
    await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId: ownerId, mode: "personal" }));
    const source: ResearchNote = {
      title: "비밀제목",
      series: "",
      source: "kofic",
      source_id: "kofic-move",
      doc_id: "locked-move",
      team_id: ownerId,
      type: "",
      publisher: "영화진흥위원회",
      author: ["김연구"],
      published: "2026-11-05",
      url: "https://example.test/move",
      pdf_url: "",
      query: "영화",
      keywords: ["키워드"],
      collected: "2026-11-16",
      converter: "",
      convert_warnings: 0,
      summary_model: "",
      team_shared: false,
      briefing_public: false,
      tags: ["정책"],
      summary: "비밀요약",
      body: "잠긴본문-표식",
      excerpt: "",
      owner_email: "",
      display_name: "김연구",
      owner_uid: ownerId,
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
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/locked-move"), {
      title: locked.title,
      publisher: locked.publisher,
      team_id: ownerId,
      owner_uid: ownerId,
      display_name: "김연구",
      briefing_public: false,
      body: "",
      summary: "",
      locked: true,
      title_hidden: locked.title_hidden,
      lock_salt: locked.lock_salt,
      lock_iterations: locked.lock_iterations,
      lock_iv: locked.lock_iv,
      lock_ciphertext: locked.lock_ciphertext,
      chunk_count: locked.locked_chunks.length,
    }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/locked-move/chunks/0000"), {
      index: 0,
      text: "",
      iv: "kept-iv",
      ciphertext: "kept-cipher",
    }));
    await assertSucceeds(updateDoc(doc(owner.firestore(), "research_notes/locked-move"), { team_id: "teamalpha" }));
    const saved = await getDoc(doc(owner.firestore(), "research_notes/locked-move"));
    expect(saved.data()?.lock_ciphertext).toBe(locked.lock_ciphertext);
    expect(saved.data()?.briefing_public).toBe(false);
    expect(saved.data()?.team_id).toBe("teamalpha");
    const chunk = await getDoc(doc(owner.firestore(), "research_notes/locked-move/chunks/0000"));
    expect(chunk.data()?.ciphertext).toBe("kept-cipher");
    const opened = await unlockResearchNote({ ...locked, team_id: "teamalpha" }, "team-password");
    expect(opened.body).toBe("잠긴본문-표식");
    expect(opened.publisher).toBe("영화진흥위원회");
  });

  it("stores a locked body over 700KB without exceeding the chunk limit", async () => {
    const owner = user(ownerId, "owner@example.com");
    await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId: ownerId, mode: "personal" }));
    const source: ResearchNote = {
      title: "긴 글",
      series: "",
      source: "kofic",
      source_id: "kofic-long",
      doc_id: "locked-long",
      team_id: ownerId,
      type: "",
      publisher: "영화진흥위원회",
      author: ["김연구"],
      published: "2026-11-05",
      url: "https://example.test/long",
      pdf_url: "",
      query: "영화",
      keywords: ["키워드"],
      collected: "2026-11-16",
      converter: "",
      convert_warnings: 0,
      summary_model: "",
      team_shared: false,
      briefing_public: false,
      tags: ["정책"],
      summary: "요약",
      body: "가".repeat(700_000),
      excerpt: "",
      owner_email: "",
      display_name: "김연구",
      owner_uid: ownerId,
      uploaded_at: "",
      locked: false,
      title_hidden: false,
      lock_salt: "",
      lock_iterations: 0,
      lock_iv: "",
      lock_ciphertext: "",
      locked_chunks: [],
    };
    const locked = await lockResearchNote(source, "long-password", true);
    expect(locked.locked_chunks.length).toBeGreaterThan(0);
    for (const chunk of locked.locked_chunks) expect(chunk.ciphertext.length).toBeLessThanOrEqual(900_000);
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/locked-long"), {
      title: locked.title,
      publisher: "",
      team_id: ownerId,
      owner_uid: ownerId,
      display_name: "김연구",
      briefing_public: false,
      body: "",
      summary: "",
      locked: true,
      title_hidden: true,
      lock_salt: locked.lock_salt,
      lock_iterations: locked.lock_iterations,
      lock_iv: locked.lock_iv,
      lock_ciphertext: locked.lock_ciphertext,
      chunk_count: locked.locked_chunks.length,
    }));
    for (const chunk of locked.locked_chunks) {
      await assertSucceeds(setDoc(doc(owner.firestore(), `research_notes/locked-long/chunks/${String(chunk.index).padStart(4, "0")}`), {
        index: chunk.index,
        text: "",
        iv: chunk.iv,
        ciphertext: chunk.ciphertext,
      }));
    }
    await assertFails(setDoc(doc(owner.firestore(), "research_notes/locked-long/chunks/9999"), {
      index: 9999,
      text: "",
      iv: "too-long",
      ciphertext: "x".repeat(900_001),
    }));
  });
});

const teamId = "teamalpha";
const codeHash = "a".repeat(64);
const codeSalt = "b".repeat(16);

async function teamLibrary() {
  const owner = user(ownerId, "owner@example.com");
  await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId, mode: "team" }));
  await assertSucceeds(setDoc(doc(owner.firestore(), `teams/${teamId}`), { ownerUid: ownerId, codeHash, codeSalt }));
  await assertSucceeds(setDoc(doc(owner.firestore(), `teams/${teamId}/members/${ownerId}`), { codeHash, displayName: "김연구" }));
  await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/team-note"), note({ team_id: teamId, briefing_public: true, title: "팀 글" })));
  return owner;
}

describe("team library rules", () => {
  it("lets a member write and blocks someone who has not joined", async () => {
    const owner = await teamLibrary();
    const outsider = user(otherId, "other@example.com");
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/mine"), note({ team_id: teamId, title: "내 팀 글" })));
    await assertFails(setDoc(doc(outsider.firestore(), "research_notes/stolen"), note({
      team_id: teamId,
      owner_uid: otherId,
      display_name: "외부",
    })));
    await assertFails(setDoc(doc(outsider.firestore(), `teams/${teamId}/members/${otherId}`), { codeHash: "c".repeat(64), displayName: "외부" }));
  });

  it("lets the briefing read this team only", async () => {
    await teamLibrary();
    const guest = env.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(guest.firestore(), "research_notes/team-note")));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "research_notes/other-team"), note({
        team_id: "othrteam",
        owner_uid: "someone1",
        display_name: "다른팀",
      }));
    });
    await assertFails(getDoc(doc(guest.firestore(), "research_notes/other-team")));
    const visible = await getDocs(query(
      collection(guest.firestore(), "research_notes"),
      where("team_id", "==", teamId),
      where("briefing_public", "==", true),
    ));
    expect(visible.docs.map((item) => item.id).sort()).toEqual(["team-note"]);
  });

  it("blocks a teammate from changing someone else's note", async () => {
    await teamLibrary();
    const mate = user("mateuser1", "mate@example.com");
    await assertSucceeds(setDoc(doc(mate.firestore(), `teams/${teamId}/members/mateuser1`), { codeHash, displayName: "동료" }));
    await assertFails(updateDoc(doc(mate.firestore(), "research_notes/team-note"), { title: "바꾼 제목" }));
    await assertFails(deleteDoc(doc(mate.firestore(), "research_notes/team-note")));
  });

  it("lets a verified member join and blocks an unverified signup", async () => {
    const owner = await teamLibrary();
    const verified = user("newuser01", "new@example.com");
    await assertSucceeds(setDoc(doc(verified.firestore(), `teams/${teamId}/members/newuser01`), { codeHash, displayName: "새팀원" }));
    const unverified = user("newuser02", "new2@example.com", false);
    await assertFails(setDoc(doc(unverified.firestore(), `teams/${teamId}/members/newuser02`), { codeHash, displayName: "미인증" }));
    const listed = await getDocs(query(
      collection(owner.firestore(), "research_notes"),
      where("team_id", "==", teamId),
      where("owner_uid", "==", ownerId),
    ));
    expect(listed.docs.map((item) => item.id)).toContain("team-note");
  });

  it("lets a personal admin join the moved team once", async () => {
    const owner = user(ownerId, "owner@example.com");
    await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId: ownerId, mode: "personal" }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "teams/movedteam"), { ownerUid: ownerId, codeHash, codeSalt }));
    await assertSucceeds(setDoc(doc(owner.firestore(), `teams/movedteam/members/${ownerId}`), { codeHash, displayName: "김연구" }));
    const member = await getDoc(doc(owner.firestore(), `teams/movedteam/members/${ownerId}`));
    expect(member.exists()).toBe(true);
    await assertFails(setDoc(doc(owner.firestore(), `teams/movedteam/members/${ownerId}`), { codeHash, displayName: "김연구" }));
  });

  it("lets a member read their own name and write only with that name", async () => {
    await teamLibrary();
    const mate = user("mateuser1", "mate@example.com");
    await assertSucceeds(setDoc(doc(mate.firestore(), `teams/${teamId}/members/mateuser1`), { codeHash, displayName: "동료" }));
    await assertFails(getDocs(collection(mate.firestore(), `teams/${teamId}/members`)));
    const self = await getDoc(doc(mate.firestore(), `teams/${teamId}/members/mateuser1`));
    expect(self.data()?.displayName).toBe("동료");
    await assertSucceeds(setDoc(doc(mate.firestore(), "research_notes/mate-note"), note({
      team_id: teamId,
      owner_uid: "mateuser1",
      display_name: "동료",
    })));
    await assertFails(setDoc(doc(mate.firestore(), "research_notes/mate-renamed"), note({
      team_id: teamId,
      owner_uid: "mateuser1",
      display_name: "다른이름",
    })));
  });

  it("keeps the admin membership when a second join is denied and still allows a new code", async () => {
    const owner = await teamLibrary();
    await assertFails(setDoc(doc(owner.firestore(), `teams/${teamId}/members/${ownerId}`), { codeHash, displayName: "김연구" }));
    const member = await getDoc(doc(owner.firestore(), `teams/${teamId}/members/${ownerId}`));
    expect(member.data()?.displayName).toBe("김연구");
    await assertSucceeds(updateDoc(doc(owner.firestore(), `teams/${teamId}`), { codeHash: "c".repeat(64), codeSalt: "c".repeat(16) }));
  });

  it("rejects a display name that differs from the member document", async () => {
    const owner = await teamLibrary();
    await assertFails(setDoc(doc(owner.firestore(), "research_notes/renamed"), note({ team_id: teamId, display_name: "다른이름" })));
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/same-name"), note({ team_id: teamId, display_name: "김연구" })));
  });

  it("lets a verified admin create the library after an unverified attempt", async () => {
    const unverified = user(ownerId, "owner@example.com", false);
    await assertFails(setDoc(doc(unverified.firestore(), "config/library"), { adminUid: ownerId, teamId, mode: "team" }));
    const owner = user(ownerId, "owner@example.com");
    await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId, mode: "team" }));
  });

  it("rejects a different account from creating the library", async () => {
    const other = user(otherId, "other@example.com");
    await assertFails(setDoc(doc(other.firestore(), "config/library"), { adminUid: otherId, teamId: "othrteam", mode: "team" }));
  });
});
