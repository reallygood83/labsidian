import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
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

describe("personal library rules", () => {
  it("lets only the owner read and write private notes, and exposes public notes to the briefing", async () => {
    const owner = env.authenticatedContext(ownerId, { email: "owner@example.com" });
    const other = env.authenticatedContext(otherId, { email: "other@example.com" });
    const guest = env.unauthenticatedContext();
    await assertSucceeds(setDoc(doc(owner.firestore(), "config/library"), { adminUid: ownerId, teamId: ownerId, mode: "personal" }));
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/private"), note()));
    await assertSucceeds(setDoc(doc(owner.firestore(), "research_notes/public"), note({ briefing_public: true, title: "공개 글" })));
    await assertFails(getDoc(doc(other.firestore(), "research_notes/private")));
    await assertFails(setDoc(doc(other.firestore(), "research_notes/stolen"), note({ owner_uid: otherId, owner_email: "other@example.com" })));
    await assertFails(getDoc(doc(guest.firestore(), "research_notes/private")));
    await assertSucceeds(getDoc(doc(guest.firestore(), "research_notes/public")));
    await assertFails(getDocs(collection(guest.firestore(), "research_notes")));
    const visible = await getDocs(query(
      collection(guest.firestore(), "research_notes"),
      where("owner_uid", "==", ownerId),
      where("briefing_public", "==", true),
    ));
    expect(visible.docs.map((item) => item.id)).toEqual(["public"]);
    await assertFails(setDoc(doc(owner.firestore(), "research_notes/fake-mail"), note({ owner_email: "other@example.com" })));
    await assertFails(setDoc(doc(owner.firestore(), "research_notes/huge"), note({ locked: true, lock_iterations: 5_000_000, briefing_public: false })));
    await assertSucceeds(deleteDoc(doc(owner.firestore(), "research_notes/private")));
  });
});
