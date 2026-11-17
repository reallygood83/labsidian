import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIRESTORE_RULES } from "../packages/shared/rulesText";
import {
  buildInviteLinks,
  codeFromLocation,
  decodePublicConfig,
  encodePublicConfig,
  hashTeamCode,
  parseInviteUrl,
  setupSteps,
  type PublicFirebaseConfig,
} from "../packages/shared/team";

const config: PublicFirebaseConfig = {
  projectId: "demo-labsidian",
  apiKey: "public-web-key",
  teamId: "team123",
  teamName: "연구팀",
  adminName: "김연구",
  codeSalt: "00112233445566778899aabbccddeeff",
  mode: "team",
  ownerUid: "",
  briefingUrl: "https://briefing.example",
};

describe("invite links", () => {
  it("round-trips the public config without keeping the team code in the blob", () => {
    const encoded = encodePublicConfig(config);
    expect(encoded).not.toContain("CODE99");
    expect(decodePublicConfig(encoded)).toEqual(config);
    const links = buildInviteLinks(config, "CODE99");
    expect(links.obsidian.includes("#t=")).toBe(true);
    expect(links.obsidian.includes("t=CODE99") && links.obsidian.indexOf("#") < links.obsidian.indexOf("t=CODE99")).toBe(true);
    expect(parseInviteUrl(links.obsidian)).toEqual({ config, code: "CODE99" });
    expect(parseInviteUrl(links.web).code).toBe("CODE99");
    expect(codeFromLocation("?c=abc&t=WRONG", "#t=RIGHT")).toEqual({ c: "abc", code: "RIGHT" });
  });

  it("hashes the team code and does not store the code itself", async () => {
    const hash = await hashTeamCode("CODE99", "salt-value");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("CODE99");
    expect(await hashTeamCode("CODE99", "salt-value")).toBe(hash);
    expect(await hashTeamCode("OTHER", "salt-value")).not.toBe(hash);
  });

  it("points each setup step at the Firebase console", () => {
    const steps = setupSteps("demo-labsidian");
    expect(steps.map((step) => step.title)).toEqual([
      "프로젝트 만들기",
      "웹 앱 추가",
      "이메일 로그인 켜기",
      "Firestore 만들기",
      "규칙 붙여넣기",
    ]);
    expect(steps[2]?.href).toContain("/authentication/providers");
    expect(steps[4]?.href).toContain("/firestore/rules");
  });

  it("ships the same rules the console copy button uses", () => {
    expect(FIRESTORE_RULES).toBe(readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"));
    expect(FIRESTORE_RULES).toContain("briefing_public");
    expect(FIRESTORE_RULES).toContain("isMember");
  });
});
