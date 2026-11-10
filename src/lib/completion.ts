// "Did I do what the plan asked?" as a single number.
//
// Each set is measured as work: the kilos the plan asked you to move against
// the kilos you actually moved. Summing work rather than averaging per-set
// scores means skipping a heavy compound costs more than skipping a light
// isolation, and beating your targets pushes the figure past 100% — which is
// the signal that the plan has gone stale and wants raising.
//
// Everything is compared like with like. An exercise with no weight target is
// scored on reps alone (logging 20 kg against no target would otherwise read
// as 2000%), a timed exercise on seconds, and a set to failure not at all —
// there is no target to fall short of.

import { targetReps, type SeedExercise } from "./setSeed";

export type CompletionExercise = SeedExercise & { sets: number };

export type CompletionLog = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
};

export type Completion = {
  planned: number;
  actual: number;
  /** Rounded, uncapped. Null when the session had nothing measurable in it. */
  percent: number | null;
  scoredSets: number;
  /** Sets that had a target and no log — skipped, or never got to. */
  skippedSets: number;
  abovePlan: boolean;
};

/**
 * Planned vs actual work for one set, or null when the set can't be scored.
 * `log` is undefined for a set that was never logged.
 */
export function setWork(
  exercise: CompletionExercise,
  log: CompletionLog | undefined,
): { planned: number; actual: number } | null {
  if (exercise.measurement === "time") {
    const target = exercise.timeSeconds;
    if (target == null || target <= 0) return null;
    return { planned: target, actual: log?.timeSeconds ?? 0 };
  }

  const reps = targetReps(exercise);
  if (reps == null || reps <= 0) return null; // to failure, or no target set

  if (exercise.targetWeight == null) {
    return { planned: reps, actual: log?.reps ?? 0 };
  }
  // A set logged without a weight still recorded its reps; assume the weight
  // asked for rather than scoring the whole set as nothing.
  const weight = log ? (log.weight ?? exercise.targetWeight) : 0;
  return {
    planned: exercise.targetWeight * reps,
    actual: weight * (log?.reps ?? 0),
  };
}

/** Roll a session's exercises up into one completion figure. */
export function completionOf(
  items: { exercise: CompletionExercise; logs: CompletionLog[] }[],
): Completion {
  let planned = 0;
  let actual = 0;
  let scoredSets = 0;
  let skippedSets = 0;

  for (const { exercise, logs } of items) {
    const bySet = new Map(logs.map((l) => [l.setNumber, l]));
    for (let n = 1; n <= exercise.sets; n++) {
      const log = bySet.get(n);
      const work = setWork(exercise, log);
      if (!work) continue;
      planned += work.planned;
      actual += work.actual;
      scoredSets++;
      if (!log) skippedSets++;
    }
  }

  const percent = planned > 0 ? Math.round((actual / planned) * 100) : null;
  return { planned, actual, percent, scoredSets, skippedSets, abovePlan: (percent ?? 0) > 100 };
}

/** The same figure from already-summed work, for all-time and trends. */
export function percentOf(planned: number, actual: number): number | null {
  return planned > 0 ? Math.round((actual / planned) * 100) : null;
}
