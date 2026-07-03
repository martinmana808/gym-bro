import { describe, expect, it } from "vitest";
import {
  buildSteps,
  formatClock,
  formatLoggedSet,
  formatSeconds,
  formatTarget,
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
    expect(formatLoggedSet({ setNumber: 1, weightKg: 60, reps: 12, timeSeconds: null })).toBe("60×12");
    expect(formatLoggedSet({ setNumber: 1, weightKg: 62.5, reps: 8, timeSeconds: null })).toBe("62.5×8");
    expect(formatLoggedSet({ setNumber: 1, weightKg: null, reps: 15, timeSeconds: null })).toBe("15");
    expect(formatLoggedSet({ setNumber: 1, weightKg: null, reps: null, timeSeconds: 40 })).toBe("40s");
  });

  it("formats clocks", () => {
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(120)).toBe("2m");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3665)).toBe("1:01:05");
  });
});
