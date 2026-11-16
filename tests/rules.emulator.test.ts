import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let env: RulesTestEnvironment;
const ownerId = "owneruser";
const otherId = "otheruser";

beforeAll(async () => {
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

function note(extra: Record<string, unknown> = {}) {
  return {
    title: "내 노트",
    team_id: ownerId,
    owner_uid: ownerId,
    owner_email: "owner@example.com",
    display_name: "김연구",
    briefing_public: false,
    body: "",
    summary: "",
    locked: false,
    ...extra,
  };
}

async function personalLibrary() {
  const owner = env.authenticatedContext(ownerId, { email: "owner@example.com" });
  await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId: ownerId, mode: "personal" }));
  await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/private"), note()));
  await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/public"), note({ briefing_public: true, title: "공개 글" })));
  return owner;
}

describe("personal library rules", () => {
  it("blocks another uid from reading or writing", async () => {
    await personalLibrary();
    const other = env.authenticatedContext(otherId, { email: "other@example.com" });
    await assertFails(getDoc(doc(other.firestore(), "research_notes/private")));
    await assertFails(setDoc(doc(other.firestore(), "research_notes/stolen"), note({ owner_uid: otherId, owner_email: "other@example.com" })));
  });

  it("rejects an owner email that does not match the signed-in account", async () => {
    const owner = await personalLibrary();
    await assertFails(setDoc(doc(owner.firestore(), "research_notes/fake-mail"), note({ owner_email: "other@example.com" })));
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
});

const teamId = "teamalpha";
const codeHash = "a".repeat(64);
const codeSalt = "b".repeat(16);

async function teamLibrary() {
  const owner = env.authenticatedContext(ownerId, { email: "owner@example.com" });
  await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId, mode: "team" }));
  await assertSucceeds(setDoc(doc(owner.firestore(), `teams/${teamId}`), { ownerUid: ownerId, codeHash, codeSalt }));
  await assertSucceeds(setDoc(doc(owner.firestore(), `teams/${teamId}/members/${ownerId}`), { codeHash, displayName: "김연구" }));
  await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/team-note"), note({ team_id: teamId, briefing_public: true, title: "팀 글" })));
  return owner;
}

describe("team library rules", () => {
  it("lets a member write and blocks someone who has not joined", async () => {
    const owner = await teamLibrary();
    const outsider = env.authenticatedContext(otherId, { email: "other@example.com" });
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/mine"), note({ team_id: teamId, title: "내 팀 글" })));
    await assertFails(setDoc(doc(outsider.firestore(), "research_notes/stolen"), note({
      team_id: teamId,
      owner_uid: otherId,
      owner_email: "other@example.com",
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
        owner_email: "a@b.co",
        display_name: "다른팀",
      }));
    });
    await assertFails(getDoc(doc(guest.firestore(), "research_notes/other-team")));
    const visible = await getDocs(query(collection(guest.firestore(), "research_notes"), where("team_id", "==", teamId)));
    expect(visible.docs.map((item) => item.id).sort()).toEqual(["team-note"]);
  });

  it("blocks a teammate from changing someone else's note", async () => {
    await teamLibrary();
    const mate = env.authenticatedContext("mateuser1", { email: "mate@example.com" });
    await assertSucceeds(setDoc(doc(mate.firestore(), `teams/${teamId}/members/mateuser1`), { codeHash, displayName: "동료" }));
    await assertFails(updateDoc(doc(mate.firestore(), "research_notes/team-note"), { title: "바꾼 제목" }));
    await assertFails(deleteDoc(doc(mate.firestore(), "research_notes/team-note")));
  });
});
