import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKciXml } from "../src/sources/kci";
import { parseKoccaDetail, parseKoccaList } from "../src/sources/kocca";
import { parseKoficDetail, parseKoficList } from "../src/sources/kofic";
import { parseOpenAlexWorks, reconstructAbstract } from "../src/sources/openalex";
import { parseRissXml } from "../src/sources/riss";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("KOFIC", () => {
  it("reads the research-report list", () => {
    const items = parseKoficList(fixture("kofic-list.html"));
    const report = items.find((item) => item.id === "9166");
    expect(report?.title).toContain("이주배경인구");
    expect(report?.published).toBe("2026-10-26");
    expect(report?.category).toBe("연구보고서");
  });

  it("reads the detail page and the PDF download fields", () => {
    const detail = parseKoficDetail(fixture("kofic-detail.html"));
    expect(detail.id).toBe("9166");
    expect(detail.authors).toContain("양경은");
    expect(detail.series).toBe("KOFIC 연구 2026-07");
    expect(detail.abstract).toContain("기초연구");
    expect(detail.files[0]?.fileUrl).toContain("/kofic/uploadFile/");
    expect(detail.files[0]?.fileNm).toMatch(/\.pdf$/);
    expect(detail.files[0]?.dnFileName).toContain(".pdf");
  });
});

describe("KOCCA", () => {
  it("reads the report list", () => {
    const items = parseKoccaList(fixture("kocca-list.html"));
    const book = items.find((item) => item.id === "1823492");
    expect(book?.title).toContain("디렉토리");
    expect(book?.published).toBe("2014-11-17");
    expect(book?.hasFile).toBe(true);
  });

  it("lets the user choose among several PDFs", () => {
    const detail = parseKoccaDetail(fixture("kocca-detail.html"));
    expect(detail.files).toHaveLength(3);
    expect(detail.files.map((file) => file.fileSn)).toEqual(["1", "2", "3"]);
    expect(detail.files[1]?.name).toContain("영화");
    expect(detail.files[0]?.atchFileId).toBe("AAGT7YUvqyLAHXomlncO6Cmtz03ER9mRzklV8mpxQ5BnSw==");
  });
});

describe("OpenAlex", () => {
  it("rebuilds an abstract and a hit", () => {
    expect(reconstructAbstract({ world: [1], Hello: [0] })).toBe("Hello world");
    const parsed = parseOpenAlexWorks({
      results: [
        {
          id: "https://openalex.org/W1",
          display_name: "Cinema study",
          publication_date: "2024-01-02",
          authorships: [{ author: { display_name: "Ada Lovelace" } }],
          keywords: [{ display_name: "film" }],
          abstract_inverted_index: { Film: [0] },
          primary_location: { landing_page_url: "https://example.edu/paper" },
          open_access: { oa_url: "https://example.edu/paper.pdf" },
          type: "article",
        },
      ],
    });
    expect(parsed.hits[0]?.sourceId).toBe("openalex-W1");
    expect(parsed.hits[0]?.hasPdf).toBe(true);
    expect(parsed.hits[0]?.authors).toEqual(["Ada Lovelace"]);
  });

  it("does not call a landing page a PDF", () => {
    const work = {
      id: "https://openalex.org/W2",
      display_name: "Landing only",
      primary_location: { landing_page_url: "https://doi.org/10.1/x", pdf_url: null },
      best_oa_location: { landing_page_url: "https://doi.org/10.1/x", pdf_url: null },
      open_access: { oa_url: "https://doi.org/10.1/x", is_oa: true },
    };
    expect(parseOpenAlexWorks({ results: [work] }).hits[0]?.hasPdf).toBe(false);
    const withPdf = { ...work, locations: [{ pdf_url: null }, { pdf_url: "https://arxiv.org/pdf/1.pdf" }] };
    const hit = parseOpenAlexWorks({ results: [withPdf] }).hits[0];
    expect(hit?.hasPdf).toBe(true);
    expect(hit?.pdfUrl).toBe("https://arxiv.org/pdf/1.pdf");
  });
});

describe("KCI", () => {
  it("explains a missing key and still parses a record", () => {
    expect(parseKciXml(fixture("kci-error.xml")).error).toContain("key");
    const parsed = parseKciXml(`<outputData><record>
      <articleInfo article-id="ART1">
        <title-group><article-title>영화 정책</article-title></title-group>
        <author-group><author><author-name>김연구</author-name></author></author-group>
        <abstract-group><abstract>초록입니다</abstract></abstract-group>
        <url>https://example.kr/art</url>
        <orte-open-yn>Y</orte-open-yn>
      </articleInfo>
      <journalInfo><journal-name>영화연구</journal-name><pub-year>2024</pub-year><pub-mon>3</pub-mon></journalInfo>
    </record></outputData>`);
    expect(parsed.articles[0]?.title).toBe("영화 정책");
    expect(parsed.articles[0]?.open).toBe(true);
    expect(parsed.articles[0]?.authors).toEqual(["김연구"]);
  });
});

describe("RISS", () => {
  it("explains a bad request and parses a record", () => {
    expect(parseRissXml(fixture("riss-error.xml")).error).toBe("형식 오류");
    const parsed = parseRissXml(`<metadata><record>
      <riss.title>콘텐츠 연구</riss.title>
      <riss.author>이논문</riss.author>
      <riss.publisher>테스트학회</riss.publisher>
      <riss.pubdate>2023</riss.pubdate>
      <riss.url>https://www.riss.kr/link?id=A100</riss.url>
    </record></metadata>`);
    expect(parsed.items[0]?.id).toBe("A100");
    expect(parsed.items[0]?.title).toBe("콘텐츠 연구");
  });
});
