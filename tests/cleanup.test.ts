import { describe, expect, it } from "vitest";
import { cleanConvertedMarkdown } from "../src/pdf/cleanup";

const sample = `# 샘플 보고서 제목

본문 첫 문장입니다.

\uE001\t샘플 보고서 제목

문장이 쪽에서 이주

민정책으로 이어집니다.

샘플 보고서 제목\t\uE002

국제결혼가정이라는

점도 확인이 필요합니다.

162

163

![그림](images/kofic/image_001.png)
`;

describe("markdown cleanup", () => {
  it("drops repeated headers and joins page-break sentences", () => {
    const cleaned = cleanConvertedMarkdown(sample, { title: "샘플 보고서 제목" });
    expect(cleaned.markdown).toContain("이주민정책으로 이어집니다.");
    expect(cleaned.markdown).toContain("국제결혼가정이라는 점도 확인이 필요합니다.");
    expect(cleaned.markdown).not.toMatch(/\uE000/);
    expect(cleaned.markdown).not.toContain("162");
    expect(cleaned.markdown).not.toContain("images/kofic");
    expect(cleaned.removedHeaders).toBeGreaterThan(0);
    expect(cleaned.joinedBreaks).toBeGreaterThanOrEqual(2);
  });
});
