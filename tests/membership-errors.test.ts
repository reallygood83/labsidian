import { describe, expect, it } from "vitest";
import type { HttpClient } from "../src/http/types";
import { createLibrary, ensureTeamLibrary, joinTeam } from "../src/team/membership";

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

  it("retries library creation after a rejected attempt without keeping the failed team id", async () => {
    const calls: string[] = [];
    let allowLibrary = false;
    const http: HttpClient = {
      async request(input) {
        calls.push(`${input.method ?? "GET"} ${input.url}`);
        if (input.url.includes("/config?documentId=library")) {
          return { status: allowLibrary ? 200 : 403, headers: {}, text: "{}", bytes: new Uint8Array() };
        }
        return { status: 200, headers: {}, text: "{}", bytes: new Uint8Array() };
      },
    };
    const unverified = jwt({ email_verified: false, user_id: "user1" });
    await expect(ensureTeamLibrary(http, "proj", unverified, "user1", "김연구", "CODE", { teamId: "", salt: "" })).rejects.toThrow("메일 인증이 필요해요");
    allowLibrary = true;
    const verified = jwt({ email_verified: true, user_id: "user1" });
    const ready = await ensureTeamLibrary(http, "proj", verified, "user1", "김연구", "CODE", { teamId: "", salt: "" });
    expect(ready.teamId.length).toBeGreaterThan(7);
    expect(calls.filter((call) => call.includes("/config?documentId=library"))).toHaveLength(2);
    expect(calls.some((call) => call.startsWith("PATCH"))).toBe(false);
  });

  it("reuses the library team id when the library already exists", async () => {
    const calls: string[] = [];
    const http: HttpClient = {
      async request(input) {
        calls.push(input.url);
        if (input.url.includes("/config?documentId=library")) return { status: 409, headers: {}, text: "{}", bytes: new Uint8Array() };
        if (input.url.endsWith("/config/library")) {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({ fields: { adminUid: { stringValue: "user1" }, teamId: { stringValue: "keptteam1" }, mode: { stringValue: "team" } } }),
            bytes: new Uint8Array(),
          };
        }
        return { status: 200, headers: {}, text: "{}", bytes: new Uint8Array() };
      },
    };
    const token = jwt({ email_verified: true, user_id: "user1" });
    const ready = await ensureTeamLibrary(http, "proj", token, "user1", "김연구", "CODE", { teamId: "", salt: "" });
    expect(ready.teamId).toBe("keptteam1");
    expect(calls.some((url) => url.includes("/teams?documentId=keptteam1"))).toBe(true);
  });

  it("updates the code when the team exists and does not rejoin an existing member", async () => {
    const calls: string[] = [];
    const http: HttpClient = {
      async request(input) {
        calls.push(`${input.method ?? "GET"} ${input.url}`);
        if (input.url.includes("/config?documentId=library")) return { status: 409, headers: {}, text: "{}", bytes: new Uint8Array() };
        if (input.url.endsWith("/config/library")) {
          return { status: 200, headers: {}, text: JSON.stringify({ fields: { adminUid: { stringValue: "user1" }, teamId: { stringValue: "keptteam1" }, mode: { stringValue: "team" } } }), bytes: new Uint8Array() };
        }
        if (input.url.includes("/teams?documentId=")) return { status: 409, headers: {}, text: "{}", bytes: new Uint8Array() };
        if ((input.method ?? "GET") === "GET" && input.url.endsWith("/members/user1")) {
          return { status: 200, headers: {}, text: JSON.stringify({ fields: { displayName: { stringValue: "김연구" } } }), bytes: new Uint8Array() };
        }
        if (input.method === "PATCH") return { status: 200, headers: {}, text: "{}", bytes: new Uint8Array() };
        return { status: 500, headers: {}, text: "{}", bytes: new Uint8Array() };
      },
    };
    const token = jwt({ email_verified: true, user_id: "user1" });
    const ready = await ensureTeamLibrary(http, "proj", token, "user1", "김연구", "CODE", { teamId: "", salt: "" });
    expect(ready.teamId).toBe("keptteam1");
    expect(calls.some((call) => call.startsWith("PATCH") && call.includes("/teams/keptteam1"))).toBe(true);
    expect(calls.some((call) => call.includes("/members?"))).toBe(false);
  });
});
