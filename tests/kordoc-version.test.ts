import { VERSION } from "kordoc";
import { describe, expect, it } from "vitest";

function atLeast(version: string, floor: string): boolean {
  const left = version.split(".").map((part) => Number(part));
  const right = floor.split(".").map((part) => Number(part));
  for (let index = 0; index < 3; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

describe("kordoc", () => {
  it("stays on 4.24.80 or newer", () => {
    expect(atLeast(VERSION, "4.24.80")).toBe(true);
  });
});
