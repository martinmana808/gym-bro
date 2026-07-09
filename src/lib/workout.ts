// Pure domain logic shared by the session runner and the history views.

export type RunnerExercise = {
  id: string;
  name: string;
  sets: number;
  measurement: "reps" | "time";
  repScheme: "fixed" | "range" | "failure" | null;
  repsMin: number | null;
  repsMax: number | null;
  timeSeconds: number | null;
  restOverrideSeconds: number | null;
};

export type RunnerBlock = {
  id: string;
  exercises: RunnerExercise[];
};

export type SetStep = {
  kind: "set";
  exercise: RunnerExercise;
  setNumber: number;
  blockIndex: number;
  round: number;
  rounds: number;
  blockSize: number; // 1 = single, 2 = superset, 3 = triset
  posInRound: number; // 1-based position within the round
};

export type RestStep = { kind: "rest"; seconds: number };

export type Step = SetStep | RestStep;

/**
 * Flattens a workout into the ordered steps of a session.
 * Within a block, one set of each exercise is performed back-to-back
 * (superset/triset), then a rest; rounds repeat up to the largest `sets`
 * of the block. No rest after the very last round of the last block.
 * Rest length = first rest override found in the block, else the workout default.
 */
export function buildSteps(blocks: RunnerBlock[], defaultRestSeconds: number): Step[] {
  const steps: Step[] = [];
  const nonEmpty = blocks.filter((b) => b.exercises.length > 0);
  nonEmpty.forEach((block, blockIndex) => {
    const rounds = Math.max(...block.exercises.map((e) => e.sets));
    const override = block.exercises.find((e) => e.restOverrideSeconds != null)?.restOverrideSeconds;
    const rest = override ?? defaultRestSeconds;
    for (let round = 1; round <= rounds; round++) {
      const inRound = block.exercises.filter((e) => e.sets >= round);
      inRound.forEach((exercise, i) => {
        steps.push({
          kind: "set",
          exercise,
          setNumber: round,
          blockIndex,
          round,
          rounds,
          blockSize: block.exercises.length,
          posInRound: i + 1,
        });
      });
      const isLast = blockIndex === nonEmpty.length - 1 && round === rounds;
      if (!isLast && rest > 0) steps.push({ kind: "rest", seconds: rest });
    }
  });
  return steps;
}

/** "4 × 10" | "3 × 10–15" | "3 × to failure" | "3 × 45s" */
export function formatTarget(e: RunnerExercise): string {
  if (e.measurement === "time") return `${e.sets} × ${formatSeconds(e.timeSeconds ?? 0)}`;
  if (e.repScheme === "failure") return `${e.sets} × to failure`;
  if (e.repScheme === "range") return `${e.sets} × ${e.repsMin}–${e.repsMax}`;
  return `${e.sets} × ${e.repsMin}`;
}

export type LoggedSet = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
};

/** "60×12" | "12" | "45s" — one logged set. */
export function formatLoggedSet(l: LoggedSet): string {
  if (l.timeSeconds != null) return formatSeconds(l.timeSeconds);
  if (l.weight != null) return `${trimNumber(l.weight)}×${l.reps ?? "?"}`;
  return `${l.reps ?? "?"}`;
}

/** "45s" | "1m" | "1m30" */
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m${s.toString().padStart(2, "0")}`;
}

/** "12:05" mm:ss (or h:mm:ss past the hour) for running clocks. */
export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = h > 0 ? m.toString().padStart(2, "0") : `${m}`;
  return `${h > 0 ? `${h}:` : ""}${mm}:${s.toString().padStart(2, "0")}`;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? `${n}` : `${n}`.replace(/(\.\d\d).*$/, "$1");
}

export function blockLabel(size: number): string {
  return size === 3 ? "Triset" : size === 2 ? "Superset" : "Exercise";
}
