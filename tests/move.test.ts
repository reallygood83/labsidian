import { describe, expect, it } from "vitest";
import { rulesForAdmin } from "../packages/shared/rulesText";
import { patchNoteTeamId } from "../src/team/firestore";
import { savedMove } from "../src/team/movePlan";
import { markdownWithDocId } from "../src/note/docId";
import type { HttpClient } from "../src/http/types";

describe("moving notes to a team", () => {
  it("patches only the team id and leaves chunks alone", async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    const http: HttpClient = {
      async request(input) {
        calls.push(input);
        return { status: 200, headers: {}, text: "{}", bytes: new Uint8Array() };
      },
    };
    await patchNoteTeamId(http, "proj", "token", "doc1", "teamalpha");
    expect(calls[0]?.url).toContain("updateMask.fieldPaths=team_id");
    expect(calls[0]?.url).toContain("updateMask.fieldPaths=owner_email");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toContain("teamalpha");
    expect(calls[0]?.body).not.toContain("lock_ciphertext");
    expect(calls[0]?.body).not.toContain("chunk");
  });

  it("writes doc_id into frontmatter and prefers that value", () => {
    const next = markdownWithDocId("---\nsource_id: \"kofic-1\"\nowner_email: \"a@b.co\"\n---\n\n본문\n", "doc-123");
    expect(next).toContain("doc_id: \"doc-123\"");
    expect(next).not.toContain("owner_email");
    expect(markdownWithDocId(next, "doc-123")).toMatch(/doc_id: "doc-123"/);
  });

  it("reuses the saved team when a move runs again", () => {
    const first = savedMove("", "", "");
    expect(first).toBeNull();
    const again = savedMove("teamone01", "s".repeat(16), "CODE");
    expect(again).toEqual({ teamId: "teamone01", salt: "s".repeat(16), code: "CODE" });
  });

  it("fills the signed-in account into the copied rules", () => {
    const rules = rulesForAdmin("owneruser");
    expect(rules).toContain('return "owneruser";');
    expect(rules).not.toContain("__LABSIDIAN_ADMIN_UID__");
  });
});
