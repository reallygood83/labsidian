import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runJob } from "../src/collect/run";
import { CollectSession, type JobView } from "../src/collect/session";
import { mergeSettings } from "../src/settings";
import { parseOpenAlexWorks, OPENALEX_QUOTA_MESSAGE } from "../src/sources/openalex";
import type { SearchHit } from "../src/sources/types";

const hit: SearchHit = {
  source: "kofic",
  sourceId: "kofic-1",
  remoteId: "1",
  title: "테스트 보고서",
  url: "https://www.kofic.or.kr/x",
  published: "2026-01-01",
  authors: [],
  publisher: "영화진흥위원회",
  keywords: [],
  hasPdf: true,
  abstract: "초록입니다.",
  series: "",
  docType: "연구보고서",
};

describe("collect", () => {
  it("still saves the note when the PDF download fails", async () => {
    const job: JobView = { id: hit.sourceId, title: hit.title, url: hit.url, source: hit.source, hasPdf: true, stage: "wait" };
    const session = new CollectSession([job]);
    const detail = readFileSync(new URL("./fixtures/kofic-detail.html", import.meta.url), "utf8");
    const http = {
      async request(input: { url: string }) {
        if (input.url.includes("findPolicyDetail")) return { status: 200, headers: {}, text: detail, bytes: new Uint8Array() };
        return { status: 500, headers: {}, text: "", bytes: new Uint8Array() };
      },
    };
    let written = "";
    const note = await runJob(session, { ...hit, remoteId: "9166" }, "영화", false, {
      ctx: { http, keys: {}, openalexMailto: "" },
      settings: mergeSettings({}),
      choose: async (files) => files[0] ?? null,
      write: async (_folder, name, markdown) => {
        written = markdown;
        return `연구자료/${name}.md`;
      },
      summaryKey: null,
      summaryUsed: 0,
    });
    expect(note).not.toBeNull();
    expect(session.jobs[0]?.stage).toBe("done");
    expect(written).toContain("## 초록");
    expect(written).toContain("PDF 본문을 넣지 못했어요");
  });
});

describe("OpenAlex quota", () => {
  it("explains the shared daily budget in Korean", () => {
    const parsed = parseOpenAlexWorks({ error: "Rate limit exceeded", reason: "daily_budget", message: "Insufficient budget." }, 429, false);
    expect(parsed.error).toBe(OPENALEX_QUOTA_MESSAGE);
  });
  it("points to the key when it is rejected", () => {
    expect(parseOpenAlexWorks({ error: "Forbidden" }, 403, true).error).toContain("키");
  });
});
