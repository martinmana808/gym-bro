"use client";

import { useState, useTransition } from "react";
import {
  createWorkout,
  updateWorkout,
  type BlockInput,
  type ExerciseInput,
  type WorkoutInput,
} from "@/app/actions";
import { blockLabel } from "@/lib/workout";

let clientId = 0;
const nextKey = () => `new-${++clientId}`;

type ExerciseDraft = ExerciseInput & { key: string };
type BlockDraft = { id?: string; key: string; exercises: ExerciseDraft[] };

const emptyExercise = (): ExerciseDraft => ({
  key: nextKey(),
  name: "",
  sets: 3,
  measurement: "reps",
  repScheme: "fixed",
  repsMin: 10,
  repsMax: 15,
  timeSeconds: 30,
  restOverrideSeconds: null,
});

const field =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-zinc-100 " +
  "placeholder:text-zinc-600 transition focus:border-lime-400 focus:outline-none";

export function WorkoutBuilder({
  workoutId,
  initial,
}: {
  workoutId?: string;
  initial?: { name: string; defaultRestSeconds: number; blocks: BlockInput[] };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rest, setRest] = useState(initial?.defaultRestSeconds ?? 90);
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    initial?.blocks.map((b) => ({
      id: b.id,
      key: b.id ?? nextKey(),
      exercises: b.exercises.map((e) => ({ ...e, key: e.id ?? nextKey() })),
    })) ?? [{ key: nextKey(), exercises: [emptyExercise()] }],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const patchExercise = (bi: number, ei: number, patch: Partial<ExerciseDraft>) =>
    setBlocks((bs) =>
      bs.map((b, i) =>
        i === bi
          ? { ...b, exercises: b.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) }
          : b,
      ),
    );

  const save = () => {
    const payload: WorkoutInput = {
      name,
      defaultRestSeconds: rest,
      blocks: blocks.map((b) => ({
        id: b.id,
        exercises: b.exercises.map((e) => ({
          id: e.id,
          name: e.name,
          sets: e.sets,
          measurement: e.measurement,
          repScheme: e.repScheme,
          repsMin: e.repsMin,
          repsMax: e.repsMax,
          timeSeconds: e.timeSeconds,
          restOverrideSeconds: e.restOverrideSeconds,
        })),
      })),
    };
    if (!payload.blocks.some((b) => b.exercises.some((e) => e.name.trim()))) {
      setError("Add at least one exercise with a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (workoutId) await updateWorkout(workoutId, payload);
        else await createWorkout(payload);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e; // Next redirect
        setError("Could not save the workout. Please try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5 pb-28">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-zinc-400">Workout name</span>
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Push day"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-zinc-400">Default rest between sets (seconds)</span>
        <input
          className={field}
          type="number"
          min={0}
          inputMode="numeric"
          value={rest}
          onChange={(e) => setRest(Number(e.target.value))}
        />
      </label>

      {blocks.map((block, bi) => (
        <section
          key={block.key}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4"
        >
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
              {bi + 1}. {blockLabel(block.exercises.length)}
            </h3>
            <div className="flex gap-1 text-zinc-400">
              <IconButton
                label="Move up"
                disabled={bi === 0}
                onClick={() =>
                  setBlocks((bs) => {
                    const copy = [...bs];
                    [copy[bi - 1], copy[bi]] = [copy[bi], copy[bi - 1]];
                    return copy;
                  })
                }
              >
                ↑
              </IconButton>
              <IconButton
                label="Move down"
                disabled={bi === blocks.length - 1}
                onClick={() =>
                  setBlocks((bs) => {
                    const copy = [...bs];
                    [copy[bi + 1], copy[bi]] = [copy[bi], copy[bi + 1]];
                    return copy;
                  })
                }
              >
                ↓
              </IconButton>
              <IconButton
                label="Remove block"
                onClick={() => setBlocks((bs) => bs.filter((_, i) => i !== bi))}
              >
                ✕
              </IconButton>
            </div>
          </header>

          <div className="flex flex-col gap-4">
            {block.exercises.map((e, ei) => (
              <div
                key={e.key}
                className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    className={field}
                    value={e.name}
                    onChange={(ev) => patchExercise(bi, ei, { name: ev.target.value })}
                    placeholder="Exercise name (e.g. Incline dumbbell press)"
                  />
                  {block.exercises.length > 1 && (
                    <IconButton
                      label="Remove exercise"
                      onClick={() =>
                        setBlocks((bs) =>
                          bs.map((b, i) =>
                            i === bi
                              ? { ...b, exercises: b.exercises.filter((_, j) => j !== ei) }
                              : b,
                          ),
                        )
                      }
                    >
                      ✕
                    </IconButton>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">Sets</span>
                    <input
                      className={field}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={e.sets}
                      onChange={(ev) => patchExercise(bi, ei, { sets: Number(ev.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">Type</span>
                    <select
                      className={field}
                      value={e.measurement}
                      onChange={(ev) =>
                        patchExercise(bi, ei, {
                          measurement: ev.target.value as "reps" | "time",
                        })
                      }
                    >
                      <option value="reps">Repetitions</option>
                      <option value="time">Time</option>
                    </select>
                  </label>

                  {e.measurement === "reps" ? (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">Reps target</span>
                        <select
                          className={field}
                          value={e.repScheme ?? "fixed"}
                          onChange={(ev) =>
                            patchExercise(bi, ei, {
                              repScheme: ev.target.value as "fixed" | "range" | "failure",
                            })
                          }
                        >
                          <option value="fixed">Fixed</option>
                          <option value="range">Range</option>
                          <option value="failure">To failure</option>
                        </select>
                      </label>
                      {e.repScheme === "fixed" && (
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Reps</span>
                          <input
                            className={field}
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={e.repsMin ?? ""}
                            onChange={(ev) =>
                              patchExercise(bi, ei, { repsMin: Number(ev.target.value) })
                            }
                          />
                        </label>
                      )}
                      {e.repScheme === "range" && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500">Min</span>
                            <input
                              className={field}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={e.repsMin ?? ""}
                              onChange={(ev) =>
                                patchExercise(bi, ei, { repsMin: Number(ev.target.value) })
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500">Max</span>
                            <input
                              className={field}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={e.repsMax ?? ""}
                              onChange={(ev) =>
                                patchExercise(bi, ei, { repsMax: Number(ev.target.value) })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Duration (seconds)</span>
                      <input
                        className={field}
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={e.timeSeconds ?? ""}
                        onChange={(ev) =>
                          patchExercise(bi, ei, { timeSeconds: Number(ev.target.value) })
                        }
                      />
                    </label>
                  )}

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">Rest override (s)</span>
                    <input
                      className={field}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={e.restOverrideSeconds ?? ""}
                      placeholder="default"
                      onChange={(ev) =>
                        patchExercise(bi, ei, {
                          restOverrideSeconds:
                            ev.target.value === "" ? null : Number(ev.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {block.exercises.length < 3 && (
            <button
              type="button"
              className="mt-3 text-sm text-lime-400 hover:text-lime-300"
              onClick={() =>
                setBlocks((bs) =>
                  bs.map((b, i) =>
                    i === bi ? { ...b, exercises: [...b.exercises, emptyExercise()] } : b,
                  ),
                )
              }
            >
              + Pair exercise ({blockLabel(block.exercises.length + 1).toLowerCase()})
            </button>
          )}
        </section>
      ))}

      <button
        type="button"
        className="rounded-2xl border border-dashed border-zinc-700 py-4 font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
        onClick={() => setBlocks((bs) => [...bs, { key: nextKey(), exercises: [emptyExercise()] }])}
      >
        + Add exercise block
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="mx-auto block w-full max-w-md rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Saving…" : workoutId ? "Save changes" : "Create workout"}
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-2 py-1 hover:bg-zinc-800 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
