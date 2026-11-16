import { describe, expect, it } from "vitest";
import { rulesForAdmin } from "../packages/shared/rulesText";
import { patchNoteTeamId } from "../src/team/firestore";
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
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toContain("teamalpha");
    expect(calls[0]?.body).not.toContain("lock_ciphertext");
    expect(calls[0]?.body).not.toContain("chunk");
  });

  it("fills the signed-in account into the copied rules", () => {
    const rules = rulesForAdmin("owneruser");
    expect(rules).toContain('return "owneruser";');
    expect(rules).not.toContain("__LABSIDIAN_ADMIN_UID__");
  });
});
