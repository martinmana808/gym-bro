// Pure domain logic shared by the session runner and the history views.

export type WeightUnit = "kg" | "bricks";

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
  note: string | null;
  weightUnit: WeightUnit;
  targetWeight: number | null;
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
  hitTarget?: boolean;
};

/** One logged set addressed to its exercise — the runner/grid data shape. */
export type SetEntry = {
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
  hitTarget?: boolean;
};

/** "72" | "22.5" | "20br" — a bare weight value with the bricks suffix. */
export function formatWeight(w: number, unit: WeightUnit): string {
  return `${trimNumber(w)}${unit === "bricks" ? "br" : ""}`;
}

/** "72 kg" | "20 br" | "—" — a labelled current working weight. */
export function formatCurrentWeight(w: number | null, unit: WeightUnit): string {
  if (w == null) return "—";
  return `${trimNumber(w)} ${unit === "bricks" ? "br" : "kg"}`;
}

/** "60 kg" | "20 br" | "—" — a labelled per-exercise target weight. */
export function formatTargetWeight(e: { targetWeight: number | null; weightUnit: WeightUnit }): string {
  return formatCurrentWeight(e.targetWeight, e.weightUnit);
}

/** "60×12" | "20br×8" | "12" | "45s" — one logged set. */
export function formatLoggedSet(l: LoggedSet, unit: WeightUnit = "kg"): string {
  if (l.timeSeconds != null) return formatSeconds(l.timeSeconds);
  const reps = l.hitTarget ? "OK" : `${l.reps ?? "?"}`;
  if (l.weight != null) return `${formatWeight(l.weight, unit)}×${reps}`;
  return reps;
}

/**
 * Dense sheet-style cell for one exercise in one session: reps joined by "·",
 * with the weight in parens only when it differs from the previous set
 * (or, for the first set, from the exercise's current working weight).
 * "8·8·8·6" | "8·8 (70) 8·6" | "(68) 8·8" | "45s·40s" | "—"
 */
export function formatSessionCell(
  logs: LoggedSet[],
  unit: WeightUnit = "kg",
  currentWeight: number | null = null,
): string {
  if (!logs.length) return "—";
  const parts: string[] = [];
  let prevWeight = currentWeight;
  for (const l of [...logs].sort((a, b) => a.setNumber - b.setNumber)) {
    if (l.weight != null && l.weight !== prevWeight) {
      parts.push(`(${formatWeight(l.weight, unit)})`);
      prevWeight = l.weight;
    }
    parts.push(
      l.timeSeconds != null ? formatSeconds(l.timeSeconds) : l.hitTarget ? "OK" : `${l.reps ?? "?"}`,
    );
  }
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const paren = parts[i].startsWith("(") || parts[i - 1].startsWith("(");
    out += paren ? ` ${parts[i]}` : `·${parts[i]}`;
  }
  return out;
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

/** Option values for a NumberSelect: min..max inclusive by step, trimmed of
 * trailing zeros; an off-step `current` value is inserted (sorted) so a saved
 * value is never dropped. */
export function numberOptions(
  min: number,
  max: number,
  step: number,
  opts?: { current?: string },
): string[] {
  const out: string[] = [];
  const decimals = (`${step}`.split(".")[1] ?? "").length;
  for (let v = min; v <= max + 1e-9; v += step) {
    out.push(trimNumber(Number(v.toFixed(decimals))));
  }
  const cur = opts?.current;
  if (cur && cur.trim() !== "" && Number.isFinite(Number(cur)) && !out.includes(cur)) {
    out.push(cur);
    out.sort((a, b) => Number(a) - Number(b));
  }
  return out;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? `${n}` : `${n}`.replace(/(\.\d\d).*$/, "$1");
}

export function blockLabel(size: number): string {
  return size === 3 ? "Triset" : size === 2 ? "Superset" : "Exercise";
}

/**
 * Group a flat, ordered exercise list into superset blocks: consecutive
 * exercises sharing the same non-null `supersetKey` become one group; a null
 * key (or a change of key) starts a new group. Order is preserved.
 */
export function groupExercisesIntoBlocks<T extends { supersetKey: string | null }>(
  exercises: T[],
): { key: string; exercises: T[] }[] {
  const groups: { key: string; exercises: T[] }[] = [];
  for (const [i, e] of exercises.entries()) {
    const last = groups.at(-1);
    const sameBlock = last && e.supersetKey != null && last.key === e.supersetKey;
    if (sameBlock) last.exercises.push(e);
    else groups.push({ key: e.supersetKey ?? `solo-${i}`, exercises: [e] });
  }
  return groups;
}
