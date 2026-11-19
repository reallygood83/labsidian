import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dropMissingImages, runJob } from "../src/collect/run";
import { cleanConvertedMarkdown } from "../src/pdf/cleanup";
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

describe("PDF pictures", () => {
  it("keeps placeholders for pictures that will be saved", () => {
    const cleaned = cleanConvertedMarkdown("본문입니다.\n\n![image](image_001.png)\n\n![image](image_002.png)\n", { keepImages: new Set(["image_001.png"]) });
    expect(cleaned.markdown).toContain("![image](image_001.png)");
    expect(cleaned.markdown).not.toContain("image_002.png");
  });
  it("drops placeholders beyond the saved set", () => {
    const text = dropMissingImages("가\n![image](image_001.png)\n나\n![image](image_009.png)\n", new Set(["image_001.png"]));
    expect(text).toContain("image_001.png");
    expect(text).not.toContain("image_009.png");
  });
});
