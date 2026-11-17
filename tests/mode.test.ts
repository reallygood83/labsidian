import { describe, expect, it } from "vitest";
import { mergeSettings } from "../src/settings";

describe("library mode", () => {
  it("starts in solo mode so search and notes stay in the vault", () => {
    const settings = mergeSettings({});
    expect(settings.libraryMode).toBe("solo");
    expect(settings.shareOnBriefing).toBe(false);
    expect(settings.firebaseProjectId).toBe("");
  });

  it("keeps an explicit personal or team choice", () => {
    expect(mergeSettings({ libraryMode: "personal" }).libraryMode).toBe("personal");
    expect(mergeSettings({ libraryMode: "team" }).libraryMode).toBe("team");
    expect(mergeSettings({ libraryMode: "cloud" }).libraryMode).toBe("solo");
  });
});
