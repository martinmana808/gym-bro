import { describe, expect, it } from "vitest";
import { seedForStep, targetReps, type SeedExercise } from "./setSeed";

const ex = (over: Partial<SeedExercise> = {}): SeedExercise => ({
  measurement: "reps",
  repScheme: "fixed",
  repsMin: 12,
  repsMax: null,
  timeSeconds: null,
  targetWeight: 40,
  ...over,
});

describe("targetReps", () => {
  it("is the prescribed number for a fixed scheme", () => {
    expect(targetReps(ex())).toBe(12);
  });

  it("aims at the top of a range", () => {
    expect(targetReps(ex({ repScheme: "range", repsMin: 8, repsMax: 12 }))).toBe(12);
  });

  it("has no number to aim at when the set is to failure", () => {
    expect(targetReps(ex({ repScheme: "failure", repsMin: null }))).toBeNull();
  });

  it("has no rep target for a timed exercise", () => {
    expect(targetReps(ex({ measurement: "time", timeSeconds: 60 }))).toBeNull();
  });
});

describe("seedForStep", () => {
  it("offers the target, not what you just managed", () => {
    // The whole point: you were told 12 and only got 10 — the next set must
    // still ask for 12, or the plan quietly ratchets down to whatever you did.
    const seed = seedForStep({
      exercise: ex({ repsMin: 12, targetWeight: 40 }),
      previous: { weight: 35, reps: 10, timeSeconds: null },
      lastWeightThisSession: 35,
    });
    expect(seed.reps).toBe("12");
    expect(seed.weight).toBe("40");
  });

  it("edits what is already logged rather than re-seeding the target", () => {
    const seed = seedForStep({
      exercise: ex(),
      existing: { weight: 35, reps: 10, timeSeconds: null },
      previous: { weight: 30, reps: 8, timeSeconds: null },
    });
    expect(seed.reps).toBe("10");
    expect(seed.weight).toBe("35");
  });

  it("falls back to this session's weight when the exercise has no target", () => {
    const seed = seedForStep({
      exercise: ex({ targetWeight: null }),
      previous: { weight: 20, reps: 8, timeSeconds: null },
      lastWeightThisSession: 30,
    });
    expect(seed.weight).toBe("30");
  });

  it("falls back to last time when there is neither target nor session weight", () => {
    const seed = seedForStep({
      exercise: ex({ targetWeight: null }),
      previous: { weight: 20, reps: 8, timeSeconds: null },
    });
    expect(seed.weight).toBe("20");
  });

  it("uses last time's reps for a set to failure, having no target", () => {
    const seed = seedForStep({
      exercise: ex({ repScheme: "failure", repsMin: null }),
      previous: { weight: 40, reps: 9, timeSeconds: null },
    });
    expect(seed.reps).toBe("9");
  });

  it("seeds the target duration for a timed exercise", () => {
    const seed = seedForStep({
      exercise: ex({ measurement: "time", repsMin: null, timeSeconds: 60 }),
      previous: { weight: null, reps: null, timeSeconds: 45 },
    });
    expect(seed.seconds).toBe("60");
    expect(seed.reps).toBe("");
  });

  it("leaves fields blank when nothing is known", () => {
    expect(
      seedForStep({ exercise: ex({ repsMin: null, targetWeight: null }) }),
    ).toEqual({ weight: "", reps: "", seconds: "" });
  });
});
