import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { hashTeamCode } from "../packages/shared/team";

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
});
