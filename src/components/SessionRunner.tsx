"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteSession, finishSession, logSet, saveSessionNote } from "@/app/actions";
import {
  blockLabel,
  buildSteps,
  formatClock,
  formatLoggedSet,
  formatTarget,
  type RunnerBlock,
  type SetEntry,
  type SetStep,
} from "@/lib/workout";
import { NumberField } from "@/components/NumberField";
import { SetGrid } from "@/components/SetGrid";

export type LogEntry = SetEntry;

const logKey = (exerciseId: string, setNumber: number) => `${exerciseId}#${setNumber}`;

const isNextRedirect = (e: unknown) => !!e && typeof e === "object" && "digest" in e;

export function SessionRunner({
  sessionId,
  workoutId,
  workoutName,
  startedAtMs,
  defaultRestSeconds,
  blocks,
  initialLogs,
  previousLogs,
  initialNotes,
}: {
  sessionId: string;
  workoutId: string;
  workoutName: string;
  startedAtMs: number;
  defaultRestSeconds: number;
  blocks: RunnerBlock[];
  initialLogs: LogEntry[];
  previousLogs: LogEntry[];
  initialNotes: { exerciseId: string; note: string }[];
}) {
  const router = useRouter();
  const steps = useMemo(() => buildSteps(blocks, defaultRestSeconds), [blocks, defaultRestSeconds]);
  const setSteps = useMemo(() => steps.filter((s): s is SetStep => s.kind === "set"), [steps]);

  const [logs, setLogs] = useState<Map<string, LogEntry>>(
    () => new Map(initialLogs.map((l) => [logKey(l.exerciseId, l.setNumber), l])),
  );
  const [notes, setNotes] = useState<Map<string, string>>(
    () => new Map(initialNotes.map((n) => [n.exerciseId, n.note])),
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
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);

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
      .filter((l) => l.exerciseId === step.exercise.id && l.weight != null)
      .at(-1)?.weight;
    setWeight(`${existing?.weight ?? prev?.weight ?? lastWeightThisSession ?? ""}`);
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
      weight: weight === "" ? null : Number(weight),
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

  const discard = async () => {
    if (!confirm("Discard this session? Its logged sets will be deleted.")) return;
    setDiscarding(true);
    try {
      await deleteSession(sessionId); // redirects back to the workout page
    } catch (e) {
      if (isNextRedirect(e)) return;
      setError("Could not discard the session — try again.");
      setDiscarding(false);
    }
  };

  const elapsed = formatClock((now - startedAtMs) / 1000);
  const loggedCount = logs.size;
  const prev = step ? prevMap.get(logKey(step.exercise.id, step.setNumber)) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3 py-4">
        <Link
          href={`/workouts/${workoutId}`}
          aria-label="Leave session — your progress is saved"
          title="Leave session — your progress is saved"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold tracking-tight">{workoutName}</h1>
          <p className="text-sm text-zinc-400">
            <span className="tabular-nums">{elapsed}</span> · {loggedCount}/{setSteps.length} sets
          </p>
        </div>
        <button
          onClick={() => setShowGrid(true)}
          aria-label="Show all sets"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ▦
        </button>
        <button
          onClick={finish}
          disabled={finishing || discarding}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-lime-400 hover:text-lime-400 disabled:opacity-50"
        >
          {finishing ? "Finishing…" : "Finish"}
        </button>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className="h-full rounded-full bg-lime-400 transition-all duration-500"
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
          <p className="text-5xl">🏁</p>
          <h2 className="text-3xl font-bold tracking-tight">All sets logged!</h2>
          <p className="text-zinc-400">
            Hit <span className="font-medium text-lime-400">Finish</span> to stamp your workout
            time.
          </p>
          <button
            onClick={finish}
            disabled={finishing || discarding}
            className="mt-2 rounded-2xl bg-lime-400 px-10 py-4 text-lg font-bold text-zinc-950 shadow-lg shadow-lime-400/20 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
          >
            {finishing ? "Finishing…" : "Finish workout"}
          </button>
        </div>
      ) : step ? (
        <div className="flex flex-1 flex-col gap-5 pt-6">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
              {step.blockSize > 1
                ? `${blockLabel(step.blockSize)} ${step.posInRound}/${step.blockSize} · round ${step.round}/${step.rounds}`
                : `Set ${step.round} of ${step.rounds}`}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{step.exercise.name}</h2>
            {step.exercise.note && (
              <p className="mt-1 text-sm text-zinc-500">{step.exercise.note}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-zinc-800/80 px-3 py-1 text-zinc-300">
                Target {formatTarget(step.exercise)}
              </span>
              {prev && (
                <span className="rounded-full bg-zinc-800/80 px-3 py-1 tabular-nums text-zinc-400">
                  Last time {formatLoggedSet(prev, step.exercise.weightUnit)}
                </span>
              )}
            </div>
            <TodayNote
              key={step.exercise.id}
              initial={notes.get(step.exercise.id) ?? ""}
              onSave={async (value) => {
                setNotes((m) => new Map(m).set(step.exercise.id, value));
                try {
                  await saveSessionNote({
                    sessionId,
                    exerciseId: step.exercise.id,
                    note: value,
                  });
                } catch {
                  setError("Could not save the note — try again.");
                }
              }}
            />
          </div>

          {(() => {
            const unit = step.exercise.weightUnit;
            return (
              <div className="flex flex-col gap-3">
                <NumberField
                  label={unit === "bricks" ? "Weight (bricks)" : "Weight (kg)"}
                  value={weight}
                  onChange={setWeight}
                  step={unit === "bricks" ? 1 : 2.5}
                  decimal={unit !== "bricks"}
                />
                {step.exercise.measurement === "reps" ? (
                  <NumberField label="Reps" value={reps} onChange={setReps} step={1} />
                ) : (
                  <NumberField label="Seconds" value={seconds} onChange={setSeconds} step={5} />
                )}
              </div>
            );
          })()}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={submitSet}
            disabled={saving || discarding}
            className="rounded-2xl bg-lime-400 py-4 text-lg font-bold text-zinc-950 shadow-lg shadow-lime-400/20 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Log set"}
          </button>

          <div className="flex justify-between text-sm text-zinc-500">
            <button
              onClick={() => setSetIndex((i) => Math.max(0, i - 1))}
              disabled={setIndex === 0}
              className="rounded-lg px-2 py-1 transition hover:text-zinc-300 disabled:opacity-30"
            >
              ← Previous set
            </button>
            <button
              onClick={() => setSetIndex((i) => Math.min(setSteps.length - 1, i + 1))}
              disabled={setIndex >= setSteps.length - 1}
              className="rounded-lg px-2 py-1 transition hover:text-zinc-300 disabled:opacity-30"
            >
              Skip set →
            </button>
          </div>

          <button
            onClick={discard}
            disabled={discarding || finishing}
            className="mx-auto mt-auto pt-4 text-xs text-zinc-600 transition hover:text-red-400 disabled:opacity-50"
          >
            {discarding ? "Discarding…" : "Discard session"}
          </button>
        </div>
      ) : (
        <p className="pt-10 text-center text-zinc-400">This workout has no exercises yet.</p>
      )}

      {showGrid && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
            <header className="flex items-center justify-between">
              <h2 className="font-semibold tracking-tight">All sets</h2>
              <button
                onClick={() => setShowGrid(false)}
                aria-label="Close"
                className="grid size-10 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-400 transition hover:text-zinc-100"
              >
                ✕
              </button>
            </header>
            <SetGrid
              blocks={blocks}
              entries={[...logs.values()]}
              activeKey={stepKey}
              onCellTap={(exerciseId, setNumber) => {
                const i = setSteps.findIndex(
                  (s) => s.exercise.id === exerciseId && s.setNumber === setNumber,
                );
                if (i !== -1) {
                  setSetIndex(i);
                  setResting(null);
                }
                setShowGrid(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TodayNote({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (value: string) => void;
}) {
  const [open, setOpen] = useState(initial !== "");
  const [value, setValue] = useState(initial);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-left text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        + Add note for today
      </button>
    );
  }
  return (
    <input
      className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
      value={value}
      placeholder="Note for today (e.g. felt weak, machine taken)"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
    />
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
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-400">Rest</p>
      <div
        className="grid size-52 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--color-sky-400) ${pct * 360}deg, var(--color-zinc-800) 0deg)`,
        }}
      >
        <div className="grid size-[11.5rem] place-items-center rounded-full bg-zinc-950">
          <span className="text-6xl font-bold tabular-nums tracking-tight">
            {formatClock(remaining)}
          </span>
        </div>
      </div>
      {nextUp && (
        <p className="text-zinc-400">
          Next up: <span className="font-medium text-zinc-100">{nextUp}</span>
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={onExtend}
          className="rounded-2xl border border-zinc-700 px-7 py-3.5 font-semibold text-zinc-200 transition hover:border-sky-400 active:scale-[0.98]"
        >
          +30s
        </button>
        <button
          onClick={onSkip}
          className="rounded-2xl bg-sky-400 px-7 py-3.5 font-semibold text-zinc-950 shadow-lg shadow-sky-400/20 transition hover:bg-sky-300 active:scale-[0.98]"
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}
