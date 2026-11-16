import { describe, expect, it } from "vitest";
import { googleForVerification, joinIfVerified, loginForVerification, signUpForVerification } from "../src/team/accountFlow";
import { VERIFY_EMAIL_MESSAGE } from "../src/team/auth";
import type { HttpClient, HttpRequest } from "../src/http/types";

function jwt(payload: Record<string, unknown>): string {
  const part = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `eyJhbGciOiJub25lIn0.${part}.sig`;
}

function http(routes: (input: HttpRequest) => { status: number; text: string }): { client: HttpClient; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    client: {
      async request(input) {
        calls.push(input);
        const result = routes(input);
        return { status: result.status, headers: {}, text: result.text, bytes: new Uint8Array() };
      },
    },
  };
}

describe("email verification before joining", () => {
  it("sends a verification mail on signup and does not join the team", async () => {
    const fake = http((input) => {
      if (input.url.includes("accounts:signUp")) {
        return { status: 200, text: JSON.stringify({ idToken: jwt({ user_id: "user1", email_verified: false }), refreshToken: "r1", localId: "user1", email: "a@b.co", expiresIn: "3600" }) };
      }
      if (input.url.includes("sendOobCode")) return { status: 200, text: "{}" };
      return { status: 500, text: "{}" };
    });
    const session = await signUpForVerification(fake.client, "key", "a@b.co", "secret");
    expect(session.idToken).toContain(".");
    expect(fake.calls.some((call) => call.url.includes("sendOobCode"))).toBe(true);
    expect(fake.calls.some((call) => call.url.includes("/members"))).toBe(false);
    expect(VERIFY_EMAIL_MESSAGE).toContain("메일을 확인");
  });

  it("joins only after login refreshes a verified token", async () => {
    const fake = http((input) => {
      if (input.url.includes("accounts:signInWithPassword")) {
        return { status: 200, text: JSON.stringify({ idToken: jwt({ user_id: "user1", email_verified: false }), refreshToken: "r1", localId: "user1", email: "a@b.co", expiresIn: "3600" }) };
      }
      if (input.url.includes("securetoken.googleapis.com")) {
        return { status: 200, text: JSON.stringify({ id_token: jwt({ user_id: "user1", email_verified: true }), refresh_token: "r2", user_id: "user1", expires_in: "3600" }) };
      }
      if (input.url.includes("/members")) return { status: 200, text: "{}" };
      return { status: 500, text: "{}" };
    });
    const fresh = await loginForVerification(fake.client, "key", "a@b.co", "secret");
    expect(fresh.verified).toBe(true);
    const joined = await joinIfVerified(fake.client, "proj", fresh.session, fresh.verified, "teamalpha", "김연구", "CODE", "salt-value-16b");
    expect(joined).toBe("joined");
    expect(fake.calls.some((call) => call.url.includes("/members"))).toBe(true);
  });

  it("does not call the team join when the refreshed token is still unverified", async () => {
    const fake = http((input) => {
      if (input.url.includes("accounts:signInWithPassword")) {
        return { status: 200, text: JSON.stringify({ idToken: jwt({ email_verified: false }), refreshToken: "r1", localId: "user1", expiresIn: "3600" }) };
      }
      if (input.url.includes("securetoken.googleapis.com")) {
        return { status: 200, text: JSON.stringify({ id_token: jwt({ user_id: "user1", email_verified: false }), refresh_token: "r1", user_id: "user1", expires_in: "3600" }) };
      }
      return { status: 500, text: "{}" };
    });
    const fresh = await loginForVerification(fake.client, "key", "a@b.co", "secret");
    const joined = await joinIfVerified(fake.client, "proj", fresh.session, fresh.verified, "teamalpha", "김연구", "CODE", "salt-value-16b");
    expect(joined).toBe("verify");
    expect(fake.calls.some((call) => call.url.includes("/members"))).toBe(false);
  });

  it("finishes Google login after refreshing a verified token", async () => {
    const fake = http((input) => {
      if (input.url.includes("accounts:signInWithIdp")) {
        return { status: 200, text: JSON.stringify({ idToken: jwt({ email_verified: false }), refreshToken: "g1", localId: "user1", email: "a@b.co", expiresIn: "3600" }) };
      }
      if (input.url.includes("securetoken.googleapis.com")) {
        return { status: 200, text: JSON.stringify({ id_token: jwt({ user_id: "user1", email_verified: true }), refresh_token: "g2", user_id: "user1", email: "a@b.co", expires_in: "3600" }) };
      }
      return { status: 500, text: "{}" };
    });
    const fresh = await googleForVerification(fake.client, "key", "google-id-token");
    expect(fresh.verified).toBe(true);
    expect(fresh.session.email).toBe("a@b.co");
    expect(fake.calls.map((call) => call.url).some((url) => url.includes("signInWithIdp"))).toBe(true);
    expect(fake.calls.map((call) => call.url).some((url) => url.includes("securetoken"))).toBe(true);
  });
});
