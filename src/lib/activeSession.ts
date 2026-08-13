// What the session widget should say. Pure so every state (working / resting /
// paused / done) is unit-testable without a DB or a clock.

import type { WeightUnit } from "@/lib/workout";

export type ActiveStep = {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  rounds: number;
  /** 1 = a plain exercise, 2+ = a superset/triset. */
  blockSize: number;
  /** "40kg / 8rep" — the target for this set. */
  targetLabel: string;
};

export type ActiveSessionInput = {
  restEndsAtMs: number | null;
  startedAtMs: number;
  /** Set while the session is paused. */
  pausedAtMs: number | null;
  /** Time already spent paused, in ms. */
  pausedMs: number;
  /** Ordered set steps, same order the session runner walks them in. */
  steps: ActiveStep[];
  /** "exerciseId#setNumber" for each set already logged. */
  loggedKeys: string[];
};

export type ActiveSessionView = {
  mode: "working" | "resting" | "paused" | "done";
  /** Headline: the exercise, or what the session is doing. */
  title: string;
  /** Countdown shown beside the title while resting. */
  timer: string | null;
  /** Second line: the target, or where you're headed next. */
  subtitle: string;
  /** Second line, accented: "Superset 1/3" / "Set 2/3". */
  position: string;
  secondsLeft: number | null;
  /** 0..1 — how much of the workout is logged. */
  progress: number;
  /** Seconds the session has actually been running, pauses excluded. */
  elapsedSeconds: number;
};

/** Just the fields the elapsed clock needs, so the runner can call it too. */
export type SessionClock = {
  startedAtMs: number;
  pausedAtMs: number | null;
  pausedMs: number;
};

/** Wall-clock time the session has been running, excluding paused stretches. */
export function sessionElapsedSeconds(input: SessionClock, nowMs: number): number {
  const pausedNow = input.pausedAtMs != null ? Math.max(0, nowMs - input.pausedAtMs) : 0;
  const ms = nowMs - input.startedAtMs - input.pausedMs - pausedNow;
  return Math.max(0, Math.floor(ms / 1000));
}

const trim = (n: number) => String(Number(n.toFixed(2)));

/** "40kg / 8rep", "7br / 10rep", "12-15rep", "45s" — compact target for the widget. */
export function formatStepTarget(e: {
  measurement: "reps" | "time";
  repScheme: "fixed" | "range" | "failure" | null;
  repsMin: number | null;
  repsMax: number | null;
  timeSeconds: number | null;
  weightUnit: WeightUnit;
  targetWeight: number | null;
}): string {
  const weight =
    e.targetWeight == null ? null : `${trim(e.targetWeight)}${e.weightUnit === "bricks" ? "br" : "kg"}`;
  let effort: string;
  if (e.measurement === "time") {
    effort = e.timeSeconds != null ? `${e.timeSeconds}s` : "";
  } else if (e.repScheme === "failure") {
    effort = "to failure";
  } else if (e.repScheme === "range" && e.repsMin != null && e.repsMax != null) {
    effort = `${e.repsMin}-${e.repsMax}rep`;
  } else {
    effort = e.repsMin != null ? `${e.repsMin}rep` : "";
  }
  return [weight, effort].filter(Boolean).join(" / ");
}

/** "Superset 2/3" for a grouped block, "Set 2/3" for a plain exercise. */
function positionLabel(step: ActiveStep): string {
  return `${step.blockSize > 1 ? "Superset" : "Set"} ${step.setNumber}/${step.rounds}`;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function activeSessionView(input: ActiveSessionInput, nowMs: number): ActiveSessionView {
  const logged = new Set(input.loggedKeys);
  const next = input.steps.find((s) => !logged.has(`${s.exerciseId}#${s.setNumber}`));

  const base = {
    progress: input.steps.length ? logged.size / input.steps.length : 1,
    elapsedSeconds: sessionElapsedSeconds(input, nowMs),
  };

  // A paused session isn't counting anything down, so it wins over rest.
  if (input.pausedAtMs != null) {
    return {
      ...base,
      mode: "paused",
      title: "Paused",
      timer: null,
      subtitle: next ? `→ ${next.exerciseName}` : "Tap to finish",
      position: next ? positionLabel(next) : "",
      secondsLeft: null,
    };
  }

  const remainingMs = input.restEndsAtMs == null ? 0 : input.restEndsAtMs - nowMs;
  // Resting wins over done: the last rest of a workout is still a countdown.
  if (remainingMs > 0) {
    const secondsLeft = Math.ceil(remainingMs / 1000);
    return {
      ...base,
      mode: "resting",
      title: "Resting",
      timer: mmss(secondsLeft),
      subtitle: next ? `→ ${next.exerciseName}` : "Tap to finish",
      position: next ? positionLabel(next) : "",
      secondsLeft,
    };
  }

  if (!next) {
    return {
      ...base,
      mode: "done",
      title: "All sets logged",
      timer: null,
      subtitle: "Tap to finish",
      position: "",
      secondsLeft: null,
    };
  }

  return {
    ...base,
    mode: "working",
    title: next.exerciseName,
    timer: null,
    subtitle: next.targetLabel,
    position: positionLabel(next),
    secondsLeft: null,
  };
}

/**
 * Did this set do what the plan asked for? The OK button used to say so
 * explicitly; now that the form is pre-filled with the target, logging those
 * values unchanged means the same thing, so we infer it.
 */
export function hitsTarget(
  target: {
    measurement: "reps" | "time";
    repScheme: "fixed" | "range" | "failure" | null;
    repsMin: number | null;
    repsMax: number | null;
    timeSeconds: number | null;
    targetWeight: number | null;
  },
  logged: { weight: number | null; reps: number | null; timeSeconds: number | null },
): boolean {
  // Weight has to match whenever one was planned.
  if (target.targetWeight != null && logged.weight !== target.targetWeight) return false;

  if (target.measurement === "time") {
    return target.timeSeconds != null && logged.timeSeconds != null
      ? logged.timeSeconds >= target.timeSeconds
      : false;
  }
  if (logged.reps == null) return false;
  // "To failure" has no number to hit, so it's never an automatic OK.
  if (target.repScheme === "failure") return false;
  if (target.repScheme === "range") {
    return (
      target.repsMin != null &&
      target.repsMax != null &&
      logged.reps >= target.repsMin &&
      logged.reps <= target.repsMax
    );
  }
  return target.repsMin != null && logged.reps === target.repsMin;
}
