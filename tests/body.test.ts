import { describe, expect, it } from "vitest";
import { placeBody, splitBody, stitchBody, utf8Bytes } from "../packages/types/body";
import { DEFAULT_SETTINGS } from "../src/settings";
import { runnableSources } from "../src/sources/registry";
import { makeNote } from "../src/collect/make";
import type { SearchHit } from "../src/sources/types";

describe("body placement", () => {
  it("keeps a short body on the parent document", () => {
    const placed = placeBody("안녕하세요");
    expect(placed.inline).toBe("안녕하세요");
    expect(placed.chunks).toEqual([]);
  });

  it("splits a body past the Firestore document limit and stitches it back", () => {
    const body = "가".repeat(50);
    const chunks = splitBody(body, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => utf8Bytes(chunk) <= 10)).toBe(true);
    expect(stitchBody("", chunks.map((text, index) => ({ index, text })))).toBe(body);
    expect(placeBody("짧은 본문").inline).toBe("짧은 본문");
  });
});

describe("KCI without a key", () => {
  it("leaves KCI out and keeps the other sources", () => {
    const sources = runnableSources(
      { ...DEFAULT_SETTINGS, sources: { ...DEFAULT_SETTINGS.sources, kci: true, riss: true } },
      {},
    );
    expect(sources.map((source) => source.id)).toEqual(["kofic", "kocca", "openalex"]);
  });
});

describe("note body", () => {
  it("keeps the full body for the team library", () => {
    const hit: SearchHit = {
      source: "kofic",
      sourceId: "kofic-1",
      remoteId: "1",
      title: "보고서",
      url: "https://example.kr",
      published: "2026-11-05",
      authors: ["김연구"],
      publisher: "영화진흥위원회",
      keywords: [],
      hasPdf: true,
      abstract: "",
      series: "시리즈",
      docType: "연구보고서",
    };
    const body = "본문".repeat(5000);
    const made = makeNote({
      hit,
      query: "영화",
      settings: DEFAULT_SETTINGS,
      collectedAt: new Date("2026-11-16T00:00:00"),
      body,
      pdfUrl: "",
      warnings: [],
      summary: "요약",
      summaryModel: "",
      converter: "kordoc 4.24.80",
      toc: "",
    });
    expect(made.note.body).toContain(body);
    expect(made.markdown).toContain("source_id:");
    expect(made.markdown).toContain(body);
  });
});
