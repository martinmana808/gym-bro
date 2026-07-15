"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logSet } from "@/app/actions";
import { NumberField } from "@/components/NumberField";
import { SetGrid } from "@/components/SetGrid";
import {
  formatLoggedSet,
  type RunnerBlock,
  type RunnerExercise,
  type SetEntry,
} from "@/lib/workout";

const cellKey = (exerciseId: string, setNumber: number) => `${exerciseId}#${setNumber}`;

export function FinishedSets({
  sessionId,
  blocks,
  initialEntries,
  notes,
}: {
  sessionId: string;
  blocks: RunnerBlock[];
  initialEntries: SetEntry[];
  notes: { exerciseId: string; note: string }[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Map<string, SetEntry>>(
    () => new Map(initialEntries.map((e) => [cellKey(e.exerciseId, e.setNumber), e])),
  );
  const [editing, setEditing] = useState<{ exercise: RunnerExercise; setNumber: number } | null>(
    null,
  );
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exercises = blocks.flatMap((b) => b.exercises);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Sets</h2>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="text-sm text-zinc-500 transition hover:text-lime-400"
        >
          {editMode ? "Done editing" : "Edit sets"}
        </button>
      </div>

      {editMode ? (
        <SetGrid
          blocks={blocks}
          entries={[...entries.values()]}
          onCellTap={(exerciseId, setNumber) => {
            const exercise = exercises.find((e) => e.id === exerciseId);
            if (exercise) setEditing({ exercise, setNumber });
          }}
        />
      ) : (
        <>
          {exercises.map((e) => {
            const mine = [...entries.values()]
              .filter((l) => l.exerciseId === e.id)
              .sort((a, b) => a.setNumber - b.setNumber);
            const note = notes.find((n) => n.exerciseId === e.id)?.note;
            if (!mine.length && !note) return null;
            return (
              <div
                key={e.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{e.name}</span>
                  <span className="whitespace-nowrap text-sm tabular-nums text-zinc-300">
                    {mine.map((l) => formatLoggedSet(l, e.weightUnit)).join(" · ")}
                  </span>
                </div>
                {note && <p className="mt-1 text-sm text-zinc-500">{note}</p>}
              </div>
            );
          })}
          {entries.size === 0 && <p className="text-sm text-zinc-500">No sets were logged.</p>}
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {editing && (
        <SetEditor
          key={cellKey(editing.exercise.id, editing.setNumber)}
          exercise={editing.exercise}
          setNumber={editing.setNumber}
          entry={entries.get(cellKey(editing.exercise.id, editing.setNumber)) ?? null}
          onClose={() => setEditing(null)}
          onSave={async (entry) => {
            setError(null);
            try {
              await logSet({ sessionId, ...entry });
              setEntries((m) => new Map(m).set(cellKey(entry.exerciseId, entry.setNumber), entry));
              setEditing(null);
              router.refresh();
            } catch {
              setError("Could not save the set — try again.");
            }
          }}
        />
      )}
    </section>
  );
}

function SetEditor({
  exercise,
  setNumber,
  entry,
  onClose,
  onSave,
}: {
  exercise: RunnerExercise;
  setNumber: number;
  entry: SetEntry | null;
  onClose: () => void;
  onSave: (entry: SetEntry) => void;
}) {
  const isTime = exercise.measurement === "time";
  const [weight, setWeight] = useState(`${entry?.weight ?? ""}`);
  const [reps, setReps] = useState(`${entry?.reps ?? ""}`);
  const [seconds, setSeconds] = useState(`${entry?.timeSeconds ?? ""}`);
  const unit = exercise.weightUnit;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-zinc-950/80" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-md rounded-t-3xl border-t border-zinc-800 bg-zinc-950 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
          Set {setNumber}
        </p>
        <h3 className="mt-1 text-xl font-bold tracking-tight">{exercise.name}</h3>
        <div className="mt-4 flex flex-col gap-3">
          <NumberField
            label={unit === "bricks" ? "Weight (bricks)" : "Weight (kg)"}
            value={weight}
            onChange={setWeight}
            step={unit === "bricks" ? 1 : 2.5}
            decimal={unit !== "bricks"}
          />
          {isTime ? (
            <NumberField label="Seconds" value={seconds} onChange={setSeconds} step={5} />
          ) : (
            <NumberField label="Reps" value={reps} onChange={setReps} step={1} />
          )}
        </div>
        <button
          onClick={() =>
            onSave({
              exerciseId: exercise.id,
              setNumber,
              weight: weight === "" ? null : Number(weight),
              reps: isTime || reps === "" ? null : Number(reps),
              timeSeconds: isTime && seconds !== "" ? Number(seconds) : null,
              // Preserve a set's "OK" status across an unrelated edit (e.g. fixing the weight).
              hitTarget: entry?.hitTarget ?? false,
            })
          }
          className="mt-4 w-full rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98]"
        >
          Save set
        </button>
      </div>
    </div>
  );
}
