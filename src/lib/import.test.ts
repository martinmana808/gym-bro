import { describe, expect, it } from "vitest";
import { parseWorkoutCsv } from "./import";

describe("parseWorkoutCsv", () => {
  const CSV = [
    "Day: Push",
    "Section: Chest",
    "Bench press,4,kg,fixed,8,60,,",
    "Incline dumbbell,4,kg,range,8-12,22.5,,",
    "Section: Triceps",
    "Pushdown,3,bricks,fixed,12,20,supA,",
    "Overhead ext,3,kg,fixed,12,15,supA,felt strong",
    "Day: Pull",
    "Section: Back",
    "Pull-up,3,bricks,failure,,,,",
  ].join("\n");

  it("parses days, sections, schemes, units, targets, supersets, notes", () => {
    const { days, warnings } = parseWorkoutCsv(CSV);
    expect(warnings).toEqual([]);
    expect(days.map((d) => d.name)).toEqual(["Push", "Pull"]);
    const push = days[0].exercises;
    expect(push).toHaveLength(4);
    expect(push[0]).toMatchObject({
      name: "Bench press", sets: 4, weightUnit: "kg", repScheme: "fixed",
      repsMin: 8, repsMax: null, targetWeight: 60, sectionName: "Chest",
      supersetGroup: null, note: null,
    });
    expect(push[1]).toMatchObject({ repScheme: "range", repsMin: 8, repsMax: 12, targetWeight: 22.5 });
    expect(push[2]).toMatchObject({ weightUnit: "bricks", sectionName: "Triceps", supersetGroup: "supA" });
    expect(push[3]).toMatchObject({ supersetGroup: "supA", note: "felt strong" });
    const pull = days[1].exercises;
    expect(pull[0]).toMatchObject({
      repScheme: "failure", repsMin: null, repsMax: null, targetWeight: null,
      weightUnit: "bricks", sectionName: "Back",
    });
  });

  it("warns on an exercise row before any Day and on an empty file", () => {
    expect(parseWorkoutCsv("Bench,4,kg,fixed,8,60,,").warnings.length).toBeGreaterThan(0);
    expect(parseWorkoutCsv("").warnings.length).toBeGreaterThan(0);
  });

  it("falls back to fixed when a range cell has no min-max", () => {
    const { days } = parseWorkoutCsv("Day: D\nBench,3,kg,range,10,50,,");
    expect(days[0].exercises[0]).toMatchObject({ repScheme: "fixed", repsMin: 10 });
  });
});
