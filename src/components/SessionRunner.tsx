"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { finishSession, logSet } from "@/app/actions";
import {
  blockLabel,
  buildSteps,
  formatClock,
  formatLoggedSet,
  formatTarget,
  type RunnerBlock,
  type SetStep,
} from "@/lib/workout";

export type LogEntry = {
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
};

const logKey = (exerciseId: string, setNumber: number) => `${exerciseId}#${setNumber}`;

const bigField =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-2xl " +
  "font-semibold text-zinc-100 focus:border-lime-400 focus:outline-none";

export function SessionRunner({
  sessionId,
  workoutName,
  startedAtMs,
  defaultRestSeconds,
  blocks,
  initialLogs,
  previousLogs,
}: {
  sessionId: string;
  workoutName: string;
  startedAtMs: number;
  defaultRestSeconds: number;
  blocks: RunnerBlock[];
  initialLogs: LogEntry[];
  previousLogs: LogEntry[];
}) {
  const router = useRouter();
  const steps = useMemo(() => buildSteps(blocks, defaultRestSeconds), [blocks, defaultRestSeconds]);
  const setSteps = useMemo(() => steps.filter((s): s is SetStep => s.kind === "set"), [steps]);

  const [logs, setLogs] = useState<Map<string, LogEntry>>(
    () => new Map(initialLogs.map((l) => [logKey(l.exerciseId, l.setNumber), l])),
  );
  const prevMap = useMemo(
    () => new Map(previousLogs.map((l) => [logKey(l.exerciseId, l.setNumber), l])),
    [previousLogs],
  );

  // Resume at the first set that hasn't been logged yet.
  const [setIndex, setSetIndex] = useState(() => {
    const i = setSteps.findIndex(
      (s) => !initialLogs.some((l) => l.exerciseId === s.exercise.id && l.setNumber === s.setNumber),
    );
    return i === -1 ? Math.max(0, setSteps.length - 1) : i;
  });
  const [resting, setResting] = useState<{ endsAt: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = setSteps[setIndex];

  // ---- form state, re-seeded during render whenever the current step changes
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [seconds, setSeconds] = useState("");
  const [seededKey, setSeededKey] = useState<string | null>(null);
  const stepKey = step ? logKey(step.exercise.id, step.setNumber) : null;
  if (step && stepKey !== seededKey) {
    setSeededKey(stepKey);
    const existing = logs.get(stepKey!);
    const prev = prevMap.get(stepKey!);
    const lastWeightThisSession = [...logs.values()]
      .filter((l) => l.exerciseId === step.exercise.id && l.weightKg != null)
      .at(-1)?.weightKg;
    setWeight(`${existing?.weightKg ?? prev?.weightKg ?? lastWeightThisSession ?? ""}`);
    setReps(`${existing?.reps ?? prev?.reps ?? step.exercise.repsMin ?? ""}`);
    setSeconds(`${existing?.timeSeconds ?? prev?.timeSeconds ?? step.exercise.timeSeconds ?? ""}`);
  }

  // ---- ticking clock (elapsed + rest countdown)
  // Starts at startedAtMs so server and client render the same first frame.
  const [now, setNow] = useState(startedAtMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const restRemaining = resting ? Math.ceil((resting.endsAt - now) / 1000) : 0;
  const isResting = resting !== null && restRemaining > 0;
  const done = logs.size >= setSteps.length && !isResting;

  const submitSet = async () => {
    if (!step) return;
    const isTime = step.exercise.measurement === "time";
    const entry: LogEntry = {
      exerciseId: step.exercise.id,
      setNumber: step.setNumber,
      weightKg: weight === "" ? null : Number(weight),
      reps: isTime || reps === "" ? null : Number(reps),
      timeSeconds: isTime && seconds !== "" ? Number(seconds) : null,
    };
    setSaving(true);
    setError(null);
    try {
      await logSet({ sessionId, ...entry });
    } catch {
      setError("Could not save this set — check your connection and try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setLogs((m) => new Map(m).set(logKey(entry.exerciseId, entry.setNumber), entry));

    // Rest if the step right after this one (in the full step list) is a rest.
    const flatIndex = steps.indexOf(step);
    const next = steps[flatIndex + 1];
    if (next?.kind === "rest") {
      setResting({ endsAt: Date.now() + next.seconds * 1000, total: next.seconds });
    }
    if (setIndex < setSteps.length - 1) setSetIndex(setIndex + 1);
  };

  const finish = async () => {
    if (!done && !confirm("Some sets are not logged yet. Finish anyway?")) return;
    setFinishing(true);
    try {
      await finishSession(sessionId);
      router.refresh();
    } catch {
      setError("Could not finish the session — try again.");
      setFinishing(false);
    }
  };

  const elapsed = formatClock((now - startedAtMs) / 1000);
  const loggedCount = logs.size;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="font-semibold">{workoutName}</h1>
          <p className="text-sm text-zinc-400">
            <span className="tabular-nums">{elapsed}</span> · {loggedCount}/{setSteps.length} sets
          </p>
        </div>
        <button
          onClick={finish}
          disabled={finishing}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-lime-400 hover:text-lime-400 disabled:opacity-50"
        >
          {finishing ? "Finishing…" : "Finish"}
        </button>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-lime-400 transition-all"
          style={{ width: `${(loggedCount / Math.max(1, setSteps.length)) * 100}%` }}
        />
      </div>

      {isResting && resting ? (
        <RestScreen
          remaining={restRemaining}
          total={resting.total}
          onExtend={() => setResting((r) => r && { ...r, endsAt: r.endsAt + 30_000 })}
          onSkip={() => setResting(null)}
          nextUp={step ? step.exercise.name : null}
        />
      ) : done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🏁</p>
          <h2 className="text-2xl font-bold">All sets logged!</h2>
          <p className="text-zinc-400">
            Hit <span className="text-lime-400">Finish</span> to stamp your workout time.
          </p>
          <button
            onClick={finish}
            disabled={finishing}
            className="rounded-xl bg-lime-400 px-8 py-3 font-semibold text-zinc-950 hover:bg-lime-300 disabled:opacity-50"
          >
            {finishing ? "Finishing…" : "Finish workout"}
          </button>
        </div>
      ) : step ? (
        <div className="flex flex-1 flex-col gap-5 pt-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-lime-400">
              {step.blockSize > 1
                ? `${blockLabel(step.blockSize)} ${step.posInRound}/${step.blockSize} · round ${step.round}/${step.rounds}`
                : `Set ${step.round}/${step.rounds}`}
            </p>
            <h2 className="mt-1 text-3xl font-bold">{step.exercise.name}</h2>
            <p className="mt-1 text-zinc-400">
              Target: {formatTarget(step.exercise)}
              {(() => {
                const prev = prevMap.get(logKey(step.exercise.id, step.setNumber));
                return prev ? ` · Last time: ${formatLoggedSet(prev)}` : "";
              })()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-zinc-400">Weight (kg)</span>
              <input
                className={bigField}
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="—"
              />
            </label>
            {step.exercise.measurement === "reps" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-zinc-400">Reps</span>
                <input
                  className={bigField}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-zinc-400">Seconds</span>
                <input
                  className={bigField}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                />
              </label>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={submitSet}
            disabled={saving}
            className="rounded-xl bg-lime-400 py-4 text-lg font-semibold text-zinc-950 hover:bg-lime-300 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Log set"}
          </button>

          <div className="flex justify-between text-sm text-zinc-500">
            <button
              onClick={() => setSetIndex((i) => Math.max(0, i - 1))}
              disabled={setIndex === 0}
              className="hover:text-zinc-300 disabled:opacity-30"
            >
              ← Previous set
            </button>
            <button
              onClick={() => setSetIndex((i) => Math.min(setSteps.length - 1, i + 1))}
              disabled={setIndex >= setSteps.length - 1}
              className="hover:text-zinc-300 disabled:opacity-30"
            >
              Skip set →
            </button>
          </div>
        </div>
      ) : (
        <p className="pt-10 text-center text-zinc-400">This workout has no exercises yet.</p>
      )}
    </div>
  );
}

function RestScreen({
  remaining,
  total,
  onExtend,
  onSkip,
  nextUp,
}: {
  remaining: number;
  total: number;
  onExtend: () => void;
  onSkip: () => void;
  nextUp: string | null;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">Rest</p>
      <div
        className="grid size-48 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--color-sky-400) ${pct * 360}deg, var(--color-zinc-800) 0deg)`,
        }}
      >
        <div className="grid size-40 place-items-center rounded-full bg-zinc-950">
          <span className="text-5xl font-bold tabular-nums">{formatClock(remaining)}</span>
        </div>
      </div>
      {nextUp && (
        <p className="text-zinc-400">
          Next up: <span className="text-zinc-100">{nextUp}</span>
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={onExtend}
          className="rounded-xl border border-zinc-700 px-6 py-3 font-semibold text-zinc-200 hover:border-sky-400"
        >
          +30s
        </button>
        <button
          onClick={onSkip}
          className="rounded-xl bg-sky-400 px-6 py-3 font-semibold text-zinc-950 hover:bg-sky-300"
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}
