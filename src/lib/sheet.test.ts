import { describe, it, expect } from "vitest";
import { buildSheetRows, programSheetToCsv } from "./sheet";

const ex = (
  id: string,
  lineageId: string,
  name: string,
  sectionName: string | null = null,
  supersetKey: string | null = null,
) => ({
  id,
  lineageId,
  name,
  sectionName,
  weightUnit: "kg" as const,
  supersetKey,
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

describe("programSheetToCsv", () => {
  it("lays out a day block with week/target/session columns and a section row", () => {
    const csv = programSheetToCsv("My Split", [
      {
        name: "Day 1",
        weeks: [{ position: 0, name: "Week 1", sessions: [{ id: "s1", label: "Nov 6" }] }],
        rows: [
          {
            key: "k",
            name: "Bench",
            sectionName: "Chest",
            weightUnit: "kg",
            groupSize: 1,
            groupPos: 1,
            byWeek: [{ target: "4×8 · 40kg", sessions: ["8·8·8·8"] }],
          },
        ],
      },
    ]);
    expect(csv.split("\n")).toEqual([
      "My Split",
      "",
      "Day 1",
      "Exercise,Week 1 · Target,Nov 6",
      "Chest",
      "Bench,4×8 · 40kg,8·8·8·8",
    ]);
  });

  it("quotes fields containing commas", () => {
    const csv = programSheetToCsv("P", [
      {
        name: "Day 1",
        weeks: [{ position: 0, name: "Week 1", sessions: [] }],
        rows: [
          { key: "k", name: "Row, wide", sectionName: null, weightUnit: "kg", groupSize: 1, groupPos: 1, byWeek: [{ target: "x", sessions: [] }] },
        ],
      },
    ]);
    expect(csv).toContain('"Row, wide",x');
  });
});

describe("buildSheetRows — superset grouping", () => {
  it("marks adjacent rows sharing a superset key as one group", () => {
    const rows = buildSheetRows(
      [
        {
          exercises: [
            ex("a", "L1", "Press plano", "Pecho", "sup-1"),
            ex("b", "L2", "Flexiones", "Pecho", "sup-1"),
            ex("c", "L3", "Pull over", "Espalda", null),
          ],
        },
      ],
      cell,
    );
    expect(rows.map((r) => [r.groupSize, r.groupPos])).toEqual([
      [2, 1],
      [2, 2],
      [1, 1],
    ]);
  });

  it("treats an ungrouped exercise as a group of one", () => {
    const rows = buildSheetRows([{ exercises: [ex("a", "L1", "Pull over")] }], cell);
    expect(rows[0].groupSize).toBe(1);
    expect(rows[0].groupPos).toBe(1);
  });

  it("does not join two different supersets that sit next to each other", () => {
    const rows = buildSheetRows(
      [
        {
          exercises: [
            ex("a", "L1", "A", null, "sup-1"),
            ex("b", "L2", "B", null, "sup-1"),
            ex("c", "L3", "C", null, "sup-2"),
            ex("d", "L4", "D", null, "sup-2"),
          ],
        },
      ],
      cell,
    );
    expect(rows.map((r) => r.groupSize)).toEqual([2, 2, 2, 2]);
    expect(rows.map((r) => r.groupPos)).toEqual([1, 2, 1, 2]);
  });
});
