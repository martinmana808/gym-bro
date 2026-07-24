import { describe, it, expect } from "vitest";
import { deriveWeeks, missingCells } from "./weeks";

describe("deriveWeeks", () => {
  it("returns one column per position with the label from the first day that has it", () => {
    const out = deriveWeeks([
      [{ position: 0, name: "Week 1" }, { position: 1, name: "Week 2" }],
      [{ position: 0, name: "ignored" }, { position: 1, name: "ignored" }],
    ]);
    expect(out).toEqual([
      { position: 0, name: "Week 1" },
      { position: 1, name: "Week 2" },
    ]);
  });

  it("covers positions present in any day (ragged), labelling from the first day that has each", () => {
    const out = deriveWeeks([
      [{ position: 0, name: "A" }],
      [{ position: 0, name: "X" }, { position: 1, name: "B" }],
    ]);
    expect(out).toEqual([
      { position: 0, name: "A" },
      { position: 1, name: "B" },
    ]);
  });

  it("falls back to Week N when no day names a position, and handles empty", () => {
    expect(deriveWeeks([])).toEqual([]);
    expect(deriveWeeks([[]])).toEqual([]);
  });
});

describe("missingCells", () => {
  it("lists (dayIndex, position) cells that have no variation", () => {
    const out = missingCells(
      [[{ position: 0 }, { position: 1 }], [{ position: 0 }]],
      2,
    );
    expect(out).toEqual([{ dayIndex: 1, position: 1 }]);
  });

  it("returns nothing for a rectangular grid", () => {
    expect(
      missingCells([[{ position: 0 }], [{ position: 0 }]], 1),
    ).toEqual([]);
  });
});
