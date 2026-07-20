import { describe, expect, it } from "vitest";
import {
  buildSteps,
  formatClock,
  formatCurrentWeight,
  formatLoggedSet,
  formatSeconds,
  formatSessionCell,
  formatTarget,
  formatTargetWeight,
  formatWeight,
  groupExercisesIntoBlocks,
  numberOptions,
  type LoggedSet,
  type RunnerExercise,
} from "./workout";

const ex = (over: Partial<RunnerExercise>): RunnerExercise => ({
  id: over.id ?? "e1",
  name: "Bench",
  sets: 3,
  measurement: "reps",
  repScheme: "fixed",
  repsMin: 10,
  repsMax: null,
  timeSeconds: null,
  restOverrideSeconds: null,
  note: null,
  weightUnit: "kg",
  targetWeight: null,
  ...over,
});

describe("buildSteps", () => {
  it("alternates a superset's exercises within each round and rests between rounds", () => {
    const steps = buildSteps(
      [{ id: "b1", exercises: [ex({ id: "a", sets: 2 }), ex({ id: "b", sets: 2 })] }],
      90,
    );
    expect(
      steps.map((s) => (s.kind === "rest" ? `rest${s.seconds}` : `${s.exercise.id}#${s.setNumber}`)),
    ).toEqual(["a#1", "b#1", "rest90", "a#2", "b#2"]);
  });

  it("does not rest after the final round of the final block, but does between blocks", () => {
    const steps = buildSteps(
      [
        { id: "b1", exercises: [ex({ id: "a", sets: 1 })] },
        { id: "b2", exercises: [ex({ id: "b", sets: 1 })] },
      ],
      60,
    );
    expect(steps.map((s) => s.kind)).toEqual(["set", "rest", "set"]);
  });

  it("uses an exercise rest override for its whole block", () => {
    const steps = buildSteps(
      [
        { id: "b1", exercises: [ex({ id: "a", sets: 2, restOverrideSeconds: 180 })] },
        { id: "b2", exercises: [ex({ id: "b", sets: 1 })] },
      ],
      60,
    );
    const rests = steps.filter((s) => s.kind === "rest").map((s) => s.seconds);
    expect(rests).toEqual([180, 180]);
  });

  it("drops exercises out of later rounds when their sets differ", () => {
    const steps = buildSteps(
      [{ id: "b1", exercises: [ex({ id: "a", sets: 3 }), ex({ id: "b", sets: 2 })] }],
      0,
    );
    expect(steps.filter((s) => s.kind === "set").map((s) => s.exercise.id)).toEqual([
      "a",
      "b",
      "a",
      "b",
      "a",
    ]);
  });

  it("skips empty blocks", () => {
    expect(buildSteps([{ id: "b1", exercises: [] }], 60)).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats targets per scheme", () => {
    expect(formatTarget(ex({ sets: 4, repsMin: 10 }))).toBe("4 × 10");
    expect(formatTarget(ex({ repScheme: "range", repsMin: 10, repsMax: 15 }))).toBe("3 × 10–15");
    expect(formatTarget(ex({ repScheme: "failure" }))).toBe("3 × to failure");
    expect(formatTarget(ex({ measurement: "time", timeSeconds: 45 }))).toBe("3 × 45s");
    expect(formatTarget(ex({ measurement: "time", timeSeconds: 90 }))).toBe("3 × 1m30");
  });

  it("formats logged sets", () => {
    expect(formatLoggedSet({ setNumber: 1, weight: 60, reps: 12, timeSeconds: null })).toBe("60×12");
    expect(formatLoggedSet({ setNumber: 1, weight: 62.5, reps: 8, timeSeconds: null })).toBe("62.5×8");
    expect(formatLoggedSet({ setNumber: 1, weight: null, reps: 15, timeSeconds: null })).toBe("15");
    expect(formatLoggedSet({ setNumber: 1, weight: null, reps: null, timeSeconds: 40 })).toBe("40s");
  });

  it("formats clocks", () => {
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(120)).toBe("2m");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3665)).toBe("1:01:05");
  });
});

const set = (setNumber: number, weight: number | null, reps: number | null): LoggedSet => ({
  setNumber,
  weight,
  reps,
  timeSeconds: null,
});

describe("weight units", () => {
  it("formats weights per unit", () => {
    expect(formatWeight(72, "kg")).toBe("72");
    expect(formatWeight(22.5, "kg")).toBe("22.5");
    expect(formatWeight(20, "bricks")).toBe("20br");
    expect(formatCurrentWeight(72, "kg")).toBe("72 kg");
    expect(formatCurrentWeight(20, "bricks")).toBe("20 br");
    expect(formatCurrentWeight(null, "kg")).toBe("—");
  });

  it("formats logged sets per unit", () => {
    expect(formatLoggedSet(set(1, 72, 8), "kg")).toBe("72×8");
    expect(formatLoggedSet(set(1, 20, 8), "bricks")).toBe("20br×8");
  });
});

describe("formatTargetWeight", () => {
  it("labels the target weight or shows a dash", () => {
    expect(formatTargetWeight({ targetWeight: 60, weightUnit: "kg" })).toBe("60 kg");
    expect(formatTargetWeight({ targetWeight: 20, weightUnit: "bricks" })).toBe("20 br");
    expect(formatTargetWeight({ targetWeight: null, weightUnit: "kg" })).toBe("—");
  });
});

describe("formatSessionCell", () => {
  it("shows reps only when weight matches the current weight", () => {
    expect(
      formatSessionCell([set(1, 68, 8), set(2, 68, 8), set(3, 68, 8), set(4, 68, 6)], "kg", 68),
    ).toBe("8·8·8·6");
  });

  it("shows weight in parens when it changes mid-session", () => {
    expect(
      formatSessionCell([set(1, 68, 8), set(2, 68, 8), set(3, 70, 8), set(4, 70, 6)], "kg", 68),
    ).toBe("8·8 (70) 8·6");
  });

  it("flags the first set when it differs from the current weight", () => {
    expect(formatSessionCell([set(1, 68, 8), set(2, 68, 8)], "kg", 72)).toBe("(68) 8·8");
  });

  it("never shows parens for weightless sets", () => {
    expect(formatSessionCell([set(1, null, 12), set(2, null, 13)], "kg", null)).toBe("12·13");
  });

  it("formats bricks and time-based sets", () => {
    expect(formatSessionCell([set(1, 20, 8), set(2, 20, 8)], "bricks", 18)).toBe("(20br) 8·8");
    expect(
      formatSessionCell(
        [
          { setNumber: 1, weight: null, reps: null, timeSeconds: 45 },
          { setNumber: 2, weight: null, reps: null, timeSeconds: 40 },
        ],
        "kg",
        null,
      ),
    ).toBe("45s·40s");
  });

  it("sorts by set number and handles empty input", () => {
    expect(formatSessionCell([set(2, 68, 6), set(1, 68, 8)], "kg", 68)).toBe("8·6");
    expect(formatSessionCell([], "kg", null)).toBe("—");
  });
});

describe("hit-target (OK) rendering", () => {
  it("formatLoggedSet shows OK for a hit-target set", () => {
    expect(formatLoggedSet({ setNumber: 1, weight: 60, reps: 8, timeSeconds: null, hitTarget: true }, "kg")).toBe("60×OK");
    expect(formatLoggedSet({ setNumber: 1, weight: null, reps: 12, timeSeconds: null, hitTarget: true })).toBe("OK");
    expect(formatLoggedSet({ setNumber: 1, weight: 60, reps: 8, timeSeconds: null, hitTarget: false }, "kg")).toBe("60×8");
  });
  it("formatSessionCell shows OK in the reps position for hit-target sets", () => {
    const set = (setNumber: number, reps: number, hitTarget: boolean) => ({ setNumber, weight: 60, reps, timeSeconds: null, hitTarget });
    expect(formatSessionCell([set(1, 8, true), set(2, 8, true), set(3, 6, false)], "kg", 60)).toBe("OK·OK·6");
  });
});

describe("groupExercisesIntoBlocks", () => {
  const ex = (id: string, supersetKey: string | null) => ({ id, supersetKey });

  it("keeps standalone exercises (null key) in their own group", () => {
    const groups = groupExercisesIntoBlocks([ex("a", null), ex("b", null)]);
    expect(groups.map((g) => g.exercises.map((e) => e.id))).toEqual([["a"], ["b"]]);
  });

  it("groups consecutive exercises sharing a key", () => {
    const groups = groupExercisesIntoBlocks([
      ex("a", null),
      ex("b", "k1"),
      ex("c", "k1"),
      ex("d", null),
    ]);
    expect(groups.map((g) => g.exercises.map((e) => e.id))).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("does not merge non-adjacent groups with the same key", () => {
    const groups = groupExercisesIntoBlocks([ex("a", "k1"), ex("b", null), ex("c", "k1")]);
    expect(groups.map((g) => g.exercises.map((e) => e.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("returns [] for empty input", () => {
    expect(groupExercisesIntoBlocks([])).toEqual([]);
  });
});

describe("numberOptions", () => {
  it("generates an inclusive range by step, trimmed", () => {
    expect(numberOptions(0, 10, 2.5)).toEqual(["0", "2.5", "5", "7.5", "10"]);
    expect(numberOptions(1, 5, 1)).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("has no float drift at 2.5 steps", () => {
    expect(numberOptions(0, 300, 2.5)).toContain("22.5");
    expect(numberOptions(0, 300, 2.5)).toContain("300");
    expect(numberOptions(0, 300, 2.5).some((o) => o.includes("."))).toBe(true);
    expect(numberOptions(0, 300, 2.5).every((o) => Number.isFinite(Number(o)))).toBe(true);
  });
  it("includes an off-step current value, sorted in", () => {
    const opts = numberOptions(0, 300, 2.5, { current: "63" });
    expect(opts).toContain("63");
    expect(opts.indexOf("63")).toBeGreaterThan(opts.indexOf("62.5"));
    expect(opts.indexOf("63")).toBeLessThan(opts.indexOf("65"));
  });
  it("ignores a current value that is blank or already present", () => {
    expect(numberOptions(1, 10, 1, { current: "" })).toEqual(numberOptions(1, 10, 1));
    expect(numberOptions(1, 10, 1, { current: "5" })).toEqual(numberOptions(1, 10, 1));
  });
});
