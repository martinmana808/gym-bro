import { describe, it, expect } from "vitest";
import { buildSheetRows } from "./sheet";

const ex = (id: string, lineageId: string, name: string, sectionName: string | null = null) => ({
  id,
  lineageId,
  name,
  sectionName,
  weightUnit: "kg" as const,
});
const cell = (exId: string, w: number) => ({ target: `${exId}@${w}`, sessions: [] });

describe("buildSheetRows", () => {
  it("aligns the same lineage across weeks onto one row, in first-appearance order", () => {
    const rows = buildSheetRows(
      [
        { exercises: [ex("a1", "L1", "Bench"), ex("b1", "L2", "Row")] },
        { exercises: [ex("a2", "L1", "Bench"), ex("b2", "L2", "Row")] },
      ],
      cell,
    );
    expect(rows.map((r) => r.name)).toEqual(["Bench", "Row"]);
    expect(rows[0].byWeek.map((c) => c?.target)).toEqual(["a1@0", "a2@1"]);
  });

  it("leaves a null cell where a week lacks the exercise, and appends new exercises", () => {
    const rows = buildSheetRows(
      [
        { exercises: [ex("a1", "L1", "Bench")] },
        { exercises: [ex("a2", "L1", "Bench"), ex("c1", "L3", "Fly")] },
      ],
      cell,
    );
    expect(rows.map((r) => r.name)).toEqual(["Bench", "Fly"]);
    expect(rows[1].byWeek.map((c) => c?.target ?? null)).toEqual([null, "c1@1"]);
  });

  it("falls back to name when lineages differ", () => {
    const rows = buildSheetRows(
      [{ exercises: [ex("a1", "X", "Bench")] }, { exercises: [ex("a2", "Y", "Bench")] }],
      cell,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].byWeek.map((c) => c?.target)).toEqual(["a1@0", "a2@1"]);
  });
});
