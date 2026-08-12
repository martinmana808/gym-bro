// What the session widget should say. Pure so every state (working / resting /
// paused / done) is unit-testable without a DB or a clock.

export type ActiveStep = {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  rounds: number;
};

export type ActiveSessionInput = {
  dayName: string;
  programName: string;
  weekName: string;
  /** Weeks in the program — the week is only worth showing when there's >1. */
  weekCount: number;
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
  /** Top line: which workout this is. */
  label: string;
  /** Big line: the exercise you're on, or the nudge to finish. */
  primary: string;
  /** Small line next to it: "set 2/3", "all sets logged". */
  detail: string;
  /** Rest countdown in seconds, when one is running. */
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

export function activeSessionView(
  input: ActiveSessionInput,
  nowMs: number,
): ActiveSessionView {
  const logged = new Set(input.loggedKeys);
  const next = input.steps.find((s) => !logged.has(`${s.exerciseId}#${s.setNumber}`));

  const label = [
    input.dayName,
    input.weekCount > 1 ? input.weekName : null,
    input.programName,
  ]
    .filter(Boolean)
    .join(" · ");

  const base = {
    label,
    progress: input.steps.length ? logged.size / input.steps.length : 1,
    elapsedSeconds: sessionElapsedSeconds(input, nowMs),
  };

  // A paused session isn't counting anything down, so it wins over rest.
  if (input.pausedAtMs != null) {
    return {
      ...base,
      mode: "paused",
      primary: next ? next.exerciseName : "Tap to finish",
      detail: "paused",
      secondsLeft: null,
    };
  }

  const remainingMs = input.restEndsAtMs == null ? 0 : input.restEndsAtMs - nowMs;
  // Resting wins over done: the last rest of a workout is still a countdown.
  if (remainingMs > 0) {
    return {
      ...base,
      mode: "resting",
      primary: next ? next.exerciseName : "Tap to finish",
      detail: "resting",
      secondsLeft: Math.ceil(remainingMs / 1000),
    };
  }

  if (!next) {
    return { ...base, mode: "done", primary: "Tap to finish", detail: "all sets logged", secondsLeft: null };
  }

  return {
    ...base,
    mode: "working",
    primary: next.exerciseName,
    detail: `set ${next.setNumber}/${next.rounds}`,
    secondsLeft: null,
  };
}
