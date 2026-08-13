import { describe, expect, it } from "vitest";
import {
  activeSessionView,
  formatStepTarget,
  hitsTarget,
  sessionElapsedSeconds,
  type ActiveSessionInput,
} from "./activeSession";

const step = (
  id: string,
  name: string,
  setNumber: number,
  extra: Partial<ActiveSessionInput["steps"][number]> = {},
) => ({
  exerciseId: id,
  exerciseName: name,
  setNumber,
  rounds: 3,
  blockSize: 2,
  targetLabel: "40kg / 8rep",
  ...extra,
});

const base: ActiveSessionInput = {
  restEndsAtMs: null,
  startedAtMs: 0,
  pausedAtMs: null,
  pausedMs: 0,
  steps: [
    step("a", "Press plano", 1),
    step("b", "Flexiones de brazos", 1),
    step("a", "Press plano", 2),
  ],
  loggedKeys: [],
};

const NOW = 1_000_000;

describe("activeSessionView — working", () => {
  it("shows the exercise, its target and its superset position", () => {
    const v = activeSessionView(base, NOW);
    expect(v.mode).toBe("working");
    expect(v.title).toBe("Press plano");
    expect(v.subtitle).toBe("40kg / 8rep");
    expect(v.position).toBe("Superset 1/3");
    expect(v.timer).toBeNull();
  });

  it("says Set, not Superset, for a lone exercise", () => {
    const v = activeSessionView(
      { ...base, steps: [step("a", "Pull over", 2, { blockSize: 1, rounds: 4 })] },
      NOW,
    );
    expect(v.position).toBe("Set 2/4");
  });

  it("skips sets already logged", () => {
    expect(activeSessionView({ ...base, loggedKeys: ["a#1"] }, NOW).title).toBe(
      "Flexiones de brazos",
    );
  });
});

describe("activeSessionView — resting", () => {
  it("counts down and points at what's next", () => {
    const v = activeSessionView(
      { ...base, loggedKeys: ["a#1"], restEndsAtMs: NOW + 84_000 },
      NOW,
    );
    expect(v.mode).toBe("resting");
    expect(v.title).toBe("Resting");
    expect(v.timer).toBe("01:24");
    expect(v.subtitle).toBe("→ Flexiones de brazos");
    expect(v.secondsLeft).toBe(84);
  });

  it("pads the clock under ten minutes and over an hour", () => {
    expect(activeSessionView({ ...base, restEndsAtMs: NOW + 9_000 }, NOW).timer).toBe("00:09");
    expect(activeSessionView({ ...base, restEndsAtMs: NOW + 605_000 }, NOW).timer).toBe("10:05");
  });

  it("falls back to working once the rest has elapsed", () => {
    expect(activeSessionView({ ...base, restEndsAtMs: NOW }, NOW).mode).toBe("working");
  });
});

describe("activeSessionView — paused", () => {
  it("beats a running rest countdown", () => {
    const v = activeSessionView(
      { ...base, restEndsAtMs: NOW + 60_000, pausedAtMs: NOW - 5_000 },
      NOW,
    );
    expect(v.mode).toBe("paused");
    expect(v.title).toBe("Paused");
    expect(v.timer).toBeNull();
    expect(v.subtitle).toBe("→ Press plano");
  });
});

describe("activeSessionView — done", () => {
  it("prompts to finish when every set is logged", () => {
    const v = activeSessionView({ ...base, loggedKeys: ["a#1", "b#1", "a#2"] }, NOW);
    expect(v.mode).toBe("done");
    expect(v.title).toBe("All sets logged");
    expect(v.subtitle).toBe("Tap to finish");
    expect(v.position).toBe("");
  });

  it("still counts down if the last rest is running", () => {
    const v = activeSessionView(
      { ...base, loggedKeys: ["a#1", "b#1", "a#2"], restEndsAtMs: NOW + 30_000 },
      NOW,
    );
    expect(v.mode).toBe("resting");
    expect(v.subtitle).toBe("Tap to finish");
  });
});

describe("progress", () => {
  it("is the share of sets logged", () => {
    expect(activeSessionView(base, NOW).progress).toBe(0);
    expect(activeSessionView({ ...base, loggedKeys: ["a#1"] }, NOW).progress).toBeCloseTo(1 / 3);
  });

  it("is complete for a workout with no sets, so the bar isn't stuck empty", () => {
    expect(activeSessionView({ ...base, steps: [] }, NOW).progress).toBe(1);
  });
});

describe("sessionElapsedSeconds", () => {
  const started = { startedAtMs: NOW - 100_000, pausedAtMs: null, pausedMs: 0 };

  it("counts wall clock when never paused", () => {
    expect(sessionElapsedSeconds(started, NOW)).toBe(100);
  });

  it("subtracts time already spent paused", () => {
    expect(sessionElapsedSeconds({ ...started, pausedMs: 30_000 }, NOW)).toBe(70);
  });

  it("freezes while paused", () => {
    const paused = { ...started, pausedAtMs: NOW - 40_000 };
    expect(sessionElapsedSeconds(paused, NOW)).toBe(60);
    expect(sessionElapsedSeconds(paused, NOW + 10_000)).toBe(60);
  });

  it("never goes negative", () => {
    expect(sessionElapsedSeconds({ ...started, pausedMs: 999_000 }, NOW)).toBe(0);
  });
});

describe("formatStepTarget", () => {
  const e = {
    measurement: "reps" as const,
    repScheme: "fixed" as const,
    repsMin: 8,
    repsMax: null,
    timeSeconds: null,
    weightUnit: "kg" as const,
    targetWeight: 40,
  };

  it("pairs weight with reps", () => {
    expect(formatStepTarget(e)).toBe("40kg / 8rep");
  });

  it("marks bricks", () => {
    expect(formatStepTarget({ ...e, weightUnit: "bricks", targetWeight: 7, repsMin: 10 })).toBe(
      "7br / 10rep",
    );
  });

  it("drops the weight for bodyweight work", () => {
    expect(formatStepTarget({ ...e, targetWeight: null })).toBe("8rep");
  });

  it("trims trailing zeros", () => {
    expect(formatStepTarget({ ...e, targetWeight: 42.5 })).toBe("42.5kg / 8rep");
    expect(formatStepTarget({ ...e, targetWeight: 40.0 })).toBe("40kg / 8rep");
  });

  it("renders ranges and failure", () => {
    expect(formatStepTarget({ ...e, repScheme: "range", repsMin: 10, repsMax: 15 })).toBe(
      "40kg / 10-15rep",
    );
    expect(formatStepTarget({ ...e, repScheme: "failure" })).toBe("40kg / to failure");
  });

  it("renders time exercises", () => {
    expect(
      formatStepTarget({ ...e, measurement: "time", timeSeconds: 45, targetWeight: null }),
    ).toBe("45s");
  });
});

describe("hitsTarget", () => {
  const fixed = {
    measurement: "reps" as const,
    repScheme: "fixed" as const,
    repsMin: 8,
    repsMax: null,
    timeSeconds: null,
    targetWeight: 40,
  };
  const log = (weight: number | null, reps: number | null) => ({
    weight,
    reps,
    timeSeconds: null,
  });

  it("is true when weight and reps both match the plan", () => {
    expect(hitsTarget(fixed, log(40, 8))).toBe(true);
  });

  it("is false when you moved a different weight", () => {
    expect(hitsTarget(fixed, log(42.5, 8))).toBe(false);
  });

  it("is false when the reps fall short — or go over", () => {
    expect(hitsTarget(fixed, log(40, 7))).toBe(false);
    expect(hitsTarget(fixed, log(40, 9))).toBe(false);
  });

  it("accepts anything inside a rep range", () => {
    const range = { ...fixed, repScheme: "range" as const, repsMin: 10, repsMax: 15 };
    expect(hitsTarget(range, log(40, 10))).toBe(true);
    expect(hitsTarget(range, log(40, 15))).toBe(true);
    expect(hitsTarget(range, log(40, 16))).toBe(false);
  });

  it("never auto-marks a to-failure set", () => {
    expect(hitsTarget({ ...fixed, repScheme: "failure" }, log(40, 20))).toBe(false);
  });

  it("ignores weight for bodyweight exercises", () => {
    expect(hitsTarget({ ...fixed, targetWeight: null }, log(null, 8))).toBe(true);
  });

  it("counts a time exercise once you reach the target", () => {
    const timed = { ...fixed, measurement: "time" as const, timeSeconds: 45, targetWeight: null };
    expect(hitsTarget(timed, { weight: null, reps: null, timeSeconds: 45 })).toBe(true);
    expect(hitsTarget(timed, { weight: null, reps: null, timeSeconds: 50 })).toBe(true);
    expect(hitsTarget(timed, { weight: null, reps: null, timeSeconds: 40 })).toBe(false);
  });
});
