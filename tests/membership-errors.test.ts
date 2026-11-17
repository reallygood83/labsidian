import { describe, expect, it } from "vitest";
import type { HttpClient } from "../src/http/types";
import { createLibrary, joinTeam } from "../src/team/membership";

function jwt(payload: Record<string, unknown>): string {
  const part = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `eyJhbGciOiJub25lIn0.${part}.sig`;
}

function forbidden(): HttpClient {
  return {
    async request() {
      return { status: 403, headers: {}, text: "{}", bytes: new Uint8Array() };
    },
  };
}

describe("firestore permission messages", () => {
  it("tells a verified member that the team code is wrong", async () => {
    const token = jwt({ email_verified: true, user_id: "user1" });
    await expect(joinTeam(forbidden(), "proj", token, "teamalpha", "user1", "김연구", "CODE", "salt-value-16char")).rejects.toThrow("팀코드가 맞지 않아요");
  });

  it("tells an unverified account to confirm the mail", async () => {
    const token = jwt({ email_verified: false, user_id: "user1" });
    await expect(joinTeam(forbidden(), "proj", token, "teamalpha", "user1", "김연구", "CODE", "salt-value-16char")).rejects.toThrow("메일 인증이 필요해요");
    await expect(createLibrary(forbidden(), "proj", token, "teamalpha", "user1", "team")).rejects.toThrow("메일 인증이 필요해요");
  });
});
