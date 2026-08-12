import { describe, expect, it } from "vitest";
import {
  activeSessionView,
  sessionElapsedSeconds,
  type ActiveSessionInput,
} from "./activeSession";

const base: ActiveSessionInput = {
  dayName: "Day 1",
  programName: "Pequeño Putarraco",
  weekName: "Week 1",
  weekCount: 1,
  restEndsAtMs: null,
  startedAtMs: 0,
  pausedAtMs: null,
  pausedMs: 0,
  steps: [
    { exerciseId: "a", exerciseName: "Press plano", setNumber: 1, rounds: 3 },
    { exerciseId: "b", exerciseName: "Flexiones de brazos", setNumber: 1, rounds: 3 },
    { exerciseId: "a", exerciseName: "Press plano", setNumber: 2, rounds: 3 },
  ],
  loggedKeys: [],
};

const NOW = 1_000_000;

describe("activeSessionView — label", () => {
  it("names the day and program", () => {
    expect(activeSessionView(base, NOW).label).toBe("Day 1 · Pequeño Putarraco");
  });

  it("includes the week once a program has more than one", () => {
    expect(activeSessionView({ ...base, weekCount: 3, weekName: "Week 2" }, NOW).label).toBe(
      "Day 1 · Week 2 · Pequeño Putarraco",
    );
  });
});

describe("activeSessionView — working", () => {
  it("points at the first unlogged set", () => {
    const v = activeSessionView(base, NOW);
    expect(v.mode).toBe("working");
    expect(v.primary).toBe("Press plano");
    expect(v.detail).toBe("set 1/3");
    expect(v.secondsLeft).toBeNull();
  });

  it("skips sets already logged", () => {
    const v = activeSessionView({ ...base, loggedKeys: ["a#1"] }, NOW);
    expect(v.primary).toBe("Flexiones de brazos");
    expect(v.detail).toBe("set 1/3");
  });

  it("counts the set number within the exercise", () => {
    const v = activeSessionView({ ...base, loggedKeys: ["a#1", "b#1"] }, NOW);
    expect(v.primary).toBe("Press plano");
    expect(v.detail).toBe("set 2/3");
  });
});

describe("activeSessionView — resting", () => {
  it("counts down and names what's next", () => {
    const v = activeSessionView(
      { ...base, loggedKeys: ["a#1"], restEndsAtMs: NOW + 72_000 },
      NOW,
    );
    expect(v.mode).toBe("resting");
    expect(v.primary).toBe("Flexiones de brazos");
    expect(v.detail).toBe("resting");
    expect(v.secondsLeft).toBe(72);
  });

  it("rounds partial seconds up so it never shows 0 early", () => {
    expect(activeSessionView({ ...base, restEndsAtMs: NOW + 1_500 }, NOW).secondsLeft).toBe(2);
  });

  it("falls back to working once the rest has elapsed", () => {
    const v = activeSessionView({ ...base, restEndsAtMs: NOW - 1 }, NOW);
    expect(v.mode).toBe("working");
    expect(v.secondsLeft).toBeNull();
  });

  it("treats exactly-zero as elapsed", () => {
    expect(activeSessionView({ ...base, restEndsAtMs: NOW }, NOW).mode).toBe("working");
  });
});

describe("activeSessionView — done", () => {
  it("prompts to finish when every set is logged", () => {
    const v = activeSessionView({ ...base, loggedKeys: ["a#1", "b#1", "a#2"] }, NOW);
    expect(v.mode).toBe("done");
    expect(v.primary).toBe("Tap to finish");
    expect(v.detail).toBe("all sets logged");
  });

  it("still shows the countdown if the last rest is running", () => {
    const v = activeSessionView(
      { ...base, loggedKeys: ["a#1", "b#1", "a#2"], restEndsAtMs: NOW + 30_000 },
      NOW,
    );
    expect(v.mode).toBe("resting");
    expect(v.secondsLeft).toBe(30);
  });

  it("handles a session whose workout has no exercises", () => {
    const v = activeSessionView({ ...base, steps: [] }, NOW);
    expect(v.mode).toBe("done");
  });
});

describe("activeSessionView — paused", () => {
  it("beats a running rest countdown", () => {
    const v = activeSessionView(
      { ...base, restEndsAtMs: NOW + 60_000, pausedAtMs: NOW - 5_000 },
      NOW,
    );
    expect(v.mode).toBe("paused");
    expect(v.detail).toBe("paused");
    expect(v.secondsLeft).toBeNull();
  });

  it("still names the exercise you're on", () => {
    const v = activeSessionView({ ...base, loggedKeys: ["a#1"], pausedAtMs: NOW }, NOW);
    expect(v.primary).toBe("Flexiones de brazos");
  });
});

describe("progress", () => {
  it("is the share of sets logged", () => {
    expect(activeSessionView(base, NOW).progress).toBe(0);
    expect(activeSessionView({ ...base, loggedKeys: ["a#1"] }, NOW).progress).toBeCloseTo(1 / 3);
    expect(activeSessionView({ ...base, loggedKeys: ["a#1", "b#1", "a#2"] }, NOW).progress).toBe(1);
  });

  it("is complete for a workout with no sets, so the bar isn't stuck empty", () => {
    expect(activeSessionView({ ...base, steps: [] }, NOW).progress).toBe(1);
  });
});

describe("sessionElapsedSeconds", () => {
  const started = { ...base, startedAtMs: NOW - 100_000 };

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
