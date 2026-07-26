import { describe, it, expect } from "vitest";
import { parseTargetCell, parseWeeksCsv } from "./import";

describe("parseTargetCell", () => {
  it("parses weight x reps in kg", () => {
    expect(parseTargetCell("40kg x 8")).toMatchObject({
      targetWeight: 40,
      weightUnit: "kg",
      repScheme: "fixed",
      repsMin: 8,
    });
  });
  it("parses bricks and a rep range", () => {
    expect(parseTargetCell("10bricks x 8-12")).toMatchObject({
      targetWeight: 10,
      weightUnit: "bricks",
      repScheme: "range",
      repsMin: 8,
      repsMax: 12,
    });
  });
  it("parses bodyweight to failure (no weight)", () => {
    expect(parseTargetCell("bodyweight x failure")).toMatchObject({
      targetWeight: null,
      repScheme: "failure",
      repsMin: null,
    });
  });
  it("defaults reps to 10 when only a weight is given, and empty cell to a blank target", () => {
    expect(parseTargetCell("50")).toMatchObject({ targetWeight: 50, repScheme: "fixed", repsMin: 10 });
    expect(parseTargetCell("")).toMatchObject({ targetWeight: null, repScheme: "fixed" });
  });
});

describe("parseWeeksCsv", () => {
  const csv = [
    "Program,My Split",
    "Day 1,Sets,Week 1,Week 2",
    "# Chest",
    "Bench press,4,40kg x 8,45kg x 6",
    "Day 2,Sets,Week 1,Week 2",
    "# Back",
    "Pull-up,3,bodyweight x failure,bodyweight x failure",
  ].join("\n");

  it("reads the program name and week columns", () => {
    const r = parseWeeksCsv(csv);
    expect(r.programName).toBe("My Split");
    expect(r.weekNames).toEqual(["Week 1", "Week 2"]);
    expect(r.days.map((d) => d.name)).toEqual(["Day 1", "Day 2"]);
  });

  it("attaches sections and a per-week target to each exercise", () => {
    const r = parseWeeksCsv(csv);
    const bench = r.days[0].exercises[0];
    expect(bench).toMatchObject({ name: "Bench press", sets: 4, sectionName: "Chest" });
    expect(bench.perWeek).toHaveLength(2);
    expect(bench.perWeek[0]).toMatchObject({ targetWeight: 40, repsMin: 8 });
    expect(bench.perWeek[1]).toMatchObject({ targetWeight: 45, repsMin: 6 });
  });

  it("pads exercises with fewer cells to the program's week count", () => {
    const r = parseWeeksCsv("Day 1,Sets,Week 1,Week 2,Week 3\nSquat,5,60kg x 5");
    expect(r.weekNames).toHaveLength(3);
    expect(r.days[0].exercises[0].perWeek).toHaveLength(3);
  });

  it("warns when there is no day header", () => {
    const r = parseWeeksCsv("just,some,text");
    expect(r.days).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
