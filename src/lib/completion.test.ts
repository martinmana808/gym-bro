import { describe, expect, it } from "vitest";
import { completionOf, setWork, type CompletionExercise } from "./completion";

const ex = (over: Partial<CompletionExercise> = {}): CompletionExercise => ({
  sets: 3,
  measurement: "reps",
  repScheme: "fixed",
  repsMin: 10,
  repsMax: null,
  timeSeconds: null,
  targetWeight: 40,
  ...over,
});

const log = (setNumber: number, weight: number | null, reps: number | null) => ({
  setNumber,
  weight,
  reps,
  timeSeconds: null,
});

describe("setWork", () => {
  it("measures a weighted set as kilos moved", () => {
    expect(setWork(ex(), log(1, 40, 10))).toEqual({ planned: 400, actual: 400 });
  });

  it("counts a shortfall in either reps or weight", () => {
    expect(setWork(ex(), log(1, 40, 5))).toEqual({ planned: 400, actual: 200 });
    expect(setWork(ex(), log(1, 20, 10))).toEqual({ planned: 400, actual: 200 });
  });

  it("lets you go above the plan", () => {
    expect(setWork(ex(), log(1, 50, 10))).toEqual({ planned: 400, actual: 500 });
  });

  it("scores a missing set as nothing done, but still expected", () => {
    expect(setWork(ex(), undefined)).toEqual({ planned: 400, actual: 0 });
  });

  // Logging 20 kg against an exercise with no target weight would otherwise
  // read as 2000% — compare only what the plan actually asked for.
  it("ignores weight when the exercise has no weight target", () => {
    expect(setWork(ex({ targetWeight: null }), log(1, 20, 10))).toEqual({
      planned: 10,
      actual: 10,
    });
  });

  it("assumes the target weight when a weighted set recorded none", () => {
    expect(setWork(ex(), log(1, null, 5))).toEqual({ planned: 400, actual: 200 });
  });

  it("aims at the top of a rep range", () => {
    const e = ex({ repScheme: "range", repsMin: 8, repsMax: 12 });
    expect(setWork(e, log(1, 40, 12))).toEqual({ planned: 480, actual: 480 });
  });

  it("compares seconds for a timed exercise", () => {
    const e = ex({ measurement: "time", repsMin: null, timeSeconds: 60, targetWeight: null });
    expect(setWork(e, { setNumber: 1, weight: null, reps: null, timeSeconds: 45 })).toEqual({
      planned: 60,
      actual: 45,
    });
  });

  it("cannot score a set to failure, which has no target", () => {
    expect(setWork(ex({ repScheme: "failure", repsMin: null }), log(1, 40, 12))).toBeNull();
  });
});

describe("completionOf", () => {
  it("is null when nothing can be scored", () => {
    const r = completionOf([{ exercise: ex({ repScheme: "failure", repsMin: null }), logs: [] }]);
    expect(r.percent).toBeNull();
    expect(r.scoredSets).toBe(0);
  });

  it("is 100% for a session done exactly to plan", () => {
    const r = completionOf([
      { exercise: ex(), logs: [log(1, 40, 10), log(2, 40, 10), log(3, 40, 10)] },
    ]);
    expect(r.percent).toBe(100);
    expect(r.scoredSets).toBe(3);
    expect(r.skippedSets).toBe(0);
  });

  it("drops when a whole exercise is skipped", () => {
    const r = completionOf([
      { exercise: ex(), logs: [log(1, 40, 10), log(2, 40, 10), log(3, 40, 10)] },
      { exercise: ex(), logs: [] },
    ]);
    expect(r.percent).toBe(50);
    expect(r.skippedSets).toBe(3);
  });

  it("goes above 100 when you beat the plan", () => {
    const r = completionOf([
      { exercise: ex({ sets: 1 }), logs: [log(1, 50, 10)] },
    ]);
    expect(r.percent).toBe(125);
    expect(r.abovePlan).toBe(true);
  });

  it("weights heavy work more than light work", () => {
    // Skipping the heavy exercise costs more than skipping the light one.
    const heavy = ex({ sets: 1, targetWeight: 100 });
    const light = ex({ sets: 1, targetWeight: 10 });
    const skippedHeavy = completionOf([
      { exercise: heavy, logs: [] },
      { exercise: light, logs: [log(1, 10, 10)] },
    ]);
    const skippedLight = completionOf([
      { exercise: heavy, logs: [log(1, 100, 10)] },
      { exercise: light, logs: [] },
    ]);
    expect(skippedHeavy.percent).toBeLessThan(skippedLight.percent!);
  });

  it("leaves sets to failure out of the sum entirely", () => {
    const r = completionOf([
      { exercise: ex({ sets: 1 }), logs: [log(1, 20, 10)] }, // half
      { exercise: ex({ sets: 1, repScheme: "failure", repsMin: null }), logs: [log(1, 99, 99)] },
    ]);
    expect(r.percent).toBe(50);
    expect(r.scoredSets).toBe(1);
  });

  it("adds up across sessions for an all-time figure", () => {
    const a = completionOf([{ exercise: ex({ sets: 1 }), logs: [log(1, 40, 10)] }]);
    const b = completionOf([{ exercise: ex({ sets: 1 }), logs: [log(1, 20, 10)] }]);
    expect(a.planned + b.planned).toBe(800);
    expect(a.actual + b.actual).toBe(600);
  });
});
