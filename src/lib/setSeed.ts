// What the log-a-set form should start at.
//
// The rule is "show me what I am supposed to do". Seeding from history instead
// lets a plan quietly ratchet down: told 12, managed 10, and every later set
// offers 10 until 12 is forgotten. History is only a fallback, for the sets
// that have no prescribed number at all.

export type SeedExercise = {
  measurement: "reps" | "time";
  repScheme: "fixed" | "range" | "failure" | null;
  repsMin: number | null;
  repsMax: number | null;
  timeSeconds: number | null;
  targetWeight: number | null;
};

export type SeedLog = {
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
};

/** The prescribed rep count, or null when the plan doesn't name one. */
export function targetReps(e: SeedExercise): number | null {
  if (e.measurement === "time") return null;
  if (e.repScheme === "failure") return null;
  // A range is a goal to push at, so offer the top of it.
  if (e.repScheme === "range") return e.repsMax ?? e.repsMin;
  return e.repsMin;
}

const str = (v: number | null | undefined) => (v == null ? "" : `${v}`);

export function seedForStep(input: {
  exercise: SeedExercise;
  /** This very set, already logged — we're editing it, so keep its numbers. */
  existing?: SeedLog | null;
  /** The same set last time round. */
  previous?: SeedLog | null;
  /** The last weight moved on this exercise in this session. */
  lastWeightThisSession?: number | null;
}): { weight: string; reps: string; seconds: string } {
  const { exercise, existing, previous, lastWeightThisSession } = input;
  const isTime = exercise.measurement === "time";

  return {
    weight: str(
      existing?.weight ??
        exercise.targetWeight ??
        lastWeightThisSession ??
        previous?.weight ??
        null,
    ),
    reps: isTime ? "" : str(existing?.reps ?? targetReps(exercise) ?? previous?.reps ?? null),
    seconds: isTime
      ? str(existing?.timeSeconds ?? exercise.timeSeconds ?? previous?.timeSeconds ?? null)
      : "",
  };
}
