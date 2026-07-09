import { describe, expect, it } from "vitest";
import { parseRepList, parseSessionCell, parseSpreadsheet, parseWeightCell } from "./import";

const TODAY = new Date(2026, 6, 9); // 2026-07-09

describe("parseWeightCell", () => {
  it("reads plain weights", () => {
    expect(parseWeightCell("72")).toMatchObject({ weight: 72, weightUnit: "kg", repScheme: "fixed" });
    expect(parseWeightCell("22.5")).toMatchObject({ weight: 22.5 });
  });
  it("detects bricks, failure, reps-min, bodyweight and notes", () => {
    expect(parseWeightCell("36.25(.pulley)")).toMatchObject({ weight: 36.25, weightUnit: "bricks" });
    expect(parseWeightCell("25 FAIL")).toMatchObject({ weight: 25, repScheme: "failure" });
    expect(parseWeightCell("12 reps min")).toMatchObject({ weight: null, repsMin: 12 });
    expect(parseWeightCell("Bodyweight")).toMatchObject({ weight: null, note: "Bodyweight" });
    expect(parseWeightCell("90 (+ barbell)")).toMatchObject({ weight: 90, note: "+ barbell" });
  });
});

describe("parseSessionCell", () => {
  it("splits single-digit runs by the set count", () => {
    const c = parseSessionCell("8888", 4, 72);
    expect(c.sets.map((s) => s.reps)).toEqual([8, 8, 8, 8]);
    expect(c.sets.map((s) => s.weight)).toEqual([72, 72, 72, 72]);
    expect(c.ambiguous).toBe(false);
  });
  it("splits double-digit runs", () => {
    expect(parseSessionCell("12131313", 4, null).sets.map((s) => s.reps)).toEqual([12, 13, 13, 13]);
  });
  it("resolves mixed digits when only one reading is plausible", () => {
    const c = parseSessionCell("181717715", 5, 25);
    expect(c.sets.map((s) => s.reps)).toEqual([18, 17, 17, 7, 15]);
    expect(c.ambiguous).toBe(false);
  });
  it("flags genuinely ambiguous cells", () => {
    expect(parseSessionCell("8888", 3, null).ambiguous).toBe(true);
  });
  it("applies weight changes from parens", () => {
    const c = parseSessionCell("77(13.5)88", 4, 16);
    expect(c.sets.map((s) => s.reps)).toEqual([7, 7, 8, 8]);
    expect(c.sets.map((s) => s.weight)).toEqual([16, 16, 13.5, 13.5]);
  });
  it("leading paren applies to all sets", () => {
    const c = parseSessionCell("(68)8886", 4, 72);
    expect(c.sets.map((s) => s.weight)).toEqual([68, 68, 68, 68]);
    expect(c.sets.map((s) => s.reps)).toEqual([8, 8, 8, 6]);
  });
  it("turns paren text into notes (keeping any number as weight)", () => {
    const c = parseSessionCell("10(38)8(40Pulley)88", 4, 35);
    expect(c.sets.map((s) => s.reps)).toEqual([10, 8, 8, 8]);
    expect(c.sets.map((s) => s.weight)).toEqual([35, 38, 40, 40]);
    expect(c.note).toBe("Pulley");
  });
  it("treats dots and commas as separators", () => {
    expect(parseSessionCell("1515..1215", 4, null).sets.map((s) => s.reps)).toEqual([15, 15, 12, 15]);
  });
  it("errors when digits cannot fill the sets", () => {
    const c = parseSessionCell("88", 4, null);
    expect(c.error).toBeTruthy();
    expect(c.sets).toEqual([]);
  });
});

describe("parseSpreadsheet", () => {
  const SHEET = [
    "Day 1\tSets\tWeight\t25.05\t27.05",
    "Chest press\t4\t72\t8888\t(68)8886",
    "Inclined machine\t4\t70\t7777\t8888",
    "Incline dumbell\t\t22.5\t7777\t8888",
    "",
    "Bicep pulley\t3\t25 FAIL\t181717\t171817",
  ].join("\n");

  it("parses days, dates, blocks and cells", () => {
    const { days, warnings } = parseSpreadsheet(SHEET, TODAY);
    expect(warnings).toEqual([]);
    expect(days).toHaveLength(1);
    const day = days[0];
    expect(day.name).toBe("Day 1");
    expect(day.dates.map((d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()])).toEqual([
      [2026, 5, 25],
      [2026, 5, 27],
    ]);
    expect(day.exercises.map((e) => e.blockStart)).toEqual([true, true, false, true]);
    expect(day.exercises[3].repScheme).toBe("failure");
    expect(day.exercises[0].cells[1]?.sets.map((s) => s.weight)).toEqual([68, 68, 68, 68]);
  });

  it("rolls future dates back a year", () => {
    const { days } = parseSpreadsheet("Day 1\tSets\tWeight\t24.12\nBench\t2\t60\t88", TODAY);
    expect(days[0].dates[0].getFullYear()).toBe(2025);
  });
});

describe("parseRepList", () => {
  it("parses manual corrections", () => {
    expect(parseRepList("18,17,17,7,15", 25)).toEqual(
      [18, 17, 17, 7, 15].map((reps, i) => ({ setNumber: i + 1, weight: 25, reps })),
    );
  });
});
