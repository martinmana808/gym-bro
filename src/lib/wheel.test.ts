import { describe, expect, it } from "vitest";
import { indexFromScroll, scrollForIndex } from "./wheel";

describe("indexFromScroll", () => {
  it("maps an exact row offset to that row", () => {
    expect(indexFromScroll(0, 44, 10)).toBe(0);
    expect(indexFromScroll(44, 44, 10)).toBe(1);
    expect(indexFromScroll(132, 44, 10)).toBe(3);
  });

  it("snaps to the nearest row when stopped between rows", () => {
    expect(indexFromScroll(50, 44, 10)).toBe(1); // 1.14 → 1
    expect(indexFromScroll(70, 44, 10)).toBe(2); // 1.59 → 2
  });

  it("clamps past either end", () => {
    expect(indexFromScroll(-30, 44, 10)).toBe(0);
    expect(indexFromScroll(99999, 44, 10)).toBe(9);
  });

  it("returns 0 for an empty list", () => {
    expect(indexFromScroll(100, 44, 0)).toBe(0);
  });
});

describe("scrollForIndex", () => {
  it("returns the offset that centres a row", () => {
    expect(scrollForIndex(0, 44)).toBe(0);
    expect(scrollForIndex(3, 44)).toBe(132);
  });

  it("never returns a negative offset", () => {
    expect(scrollForIndex(-2, 44)).toBe(0);
  });
});
