// What the bottom "session in progress" bar should say. Pure so the three
// states (working / resting / done) are unit-testable without a DB or a clock.

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
  /** Ordered set steps, same order the session runner walks them in. */
  steps: ActiveStep[];
  /** "exerciseId#setNumber" for each set already logged. */
  loggedKeys: string[];
};

export type ActiveSessionView = {
  mode: "working" | "resting" | "done";
  /** Top line: which workout this is. */
  label: string;
  /** Big line: the exercise you're on, or the nudge to finish. */
  primary: string;
  /** Small line: "set 2/3", "resting", "all sets logged". */
  detail: string;
  secondsLeft: number | null;
};

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

  const remainingMs = input.restEndsAtMs == null ? 0 : input.restEndsAtMs - nowMs;
  // Resting wins over done: the last rest of a workout is still a countdown.
  if (remainingMs > 0) {
    return {
      mode: "resting",
      label,
      primary: next ? next.exerciseName : "Tap to finish",
      detail: "resting",
      secondsLeft: Math.ceil(remainingMs / 1000),
    };
  }

  if (!next) {
    return {
      mode: "done",
      label,
      primary: "Tap to finish",
      detail: "all sets logged",
      secondsLeft: null,
    };
  }

  return {
    mode: "working",
    label,
    primary: next.exerciseName,
    detail: `set ${next.setNumber}/${next.rounds}`,
    secondsLeft: null,
  };
}
