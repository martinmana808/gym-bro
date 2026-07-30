import { describe, expect, it } from "vitest";
import { ITEM_H, indexFromScroll, rowGeometry, scrollForIndex } from "./wheel";

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

/** Where a row actually lands on screen, relative to the centre row. */
const screenY = (d: number) => d * ITEM_H + rowGeometry(d).translateY;

describe("rowGeometry (cylinder projection)", () => {
  it("leaves the centre row untouched", () => {
    const g = rowGeometry(0);
    expect(g.translateY).toBeCloseTo(0);
    expect(g.rot).toBeCloseTo(0);
    expect(g.opacity).toBeCloseTo(1);
  });

  it("bunches rows closer together the further they are from the centre", () => {
    const gap1 = screenY(1) - screenY(0);
    const gap3 = screenY(3) - screenY(2);
    const gap4 = screenY(4) - screenY(3);
    expect(gap3).toBeLessThan(gap1);
    expect(gap4).toBeLessThan(gap3);
  });

  it("rotates and fades rows further out, symmetrically about the centre", () => {
    expect(Math.abs(rowGeometry(2).rot)).toBeGreaterThan(Math.abs(rowGeometry(1).rot));
    expect(rowGeometry(3).opacity).toBeLessThan(rowGeometry(1).opacity);
    expect(rowGeometry(-2).opacity).toBeCloseTo(rowGeometry(2).opacity);
    expect(rowGeometry(-2).translateY).toBeCloseTo(-rowGeometry(2).translateY);
  });

  it("hides rows that have turned past the edge of the drum", () => {
    expect(rowGeometry(5).hidden).toBe(true);
    expect(rowGeometry(5).opacity).toBe(0);
    expect(rowGeometry(4).hidden).toBe(false);
  });
});
