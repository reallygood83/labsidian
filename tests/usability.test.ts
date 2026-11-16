import { describe, expect, it } from "vitest";
import { batchSummary, findDuplicate, previewLines, saveButtonLabel, TOUR_STEPS, yearOf } from "../src/collect/usability";

describe("search usability", () => {
  it("shows the first three abstract lines", () => {
    const text = previewLines("첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄");
    expect(text).toBe("첫째 줄\n둘째 줄\n셋째 줄");
  });

  it("reads the year and names the save button", () => {
    expect(yearOf("2024-03-01")).toBe("2024");
    expect(saveButtonLabel(2)).toBe("선택한 2개 저장");
  });

  it("matches an existing note by source id, DOI, or URL and skips a second save", () => {
    const saved = [{ sourceId: "kofic-1", doi: "10.1/abc", url: "https://example.test/a", path: "연구자료/a.md" }];
    expect(findDuplicate({ sourceId: "kofic-1", doi: "", url: "" }, saved)?.path).toBe("연구자료/a.md");
    expect(findDuplicate({ sourceId: "other", doi: "10.1/ABC", url: "" }, saved)?.path).toBe("연구자료/a.md");
    expect(findDuplicate({ sourceId: "other", doi: "", url: "https://example.test/a/" }, saved)?.path).toBe("연구자료/a.md");
    expect(findDuplicate({ sourceId: "new", doi: "", url: "https://example.test/b" }, saved)).toBeNull();
  });

  it("summarizes a batch that skipped failures", () => {
    expect(batchSummary(3, 0)).toBe("3개를 저장했어요.");
    expect(batchSummary(2, 1)).toBe("2개를 저장했어요. 1개는 실패해서 건너뛰었어요.");
  });

  it("walks the first-run tour from search to open", () => {
    expect(TOUR_STEPS.map((step) => step.title)).toEqual(["예시 검색", "미리보기", "저장", "열기"]);
  });
});
