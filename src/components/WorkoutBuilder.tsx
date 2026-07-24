"use client";

import { useState, useTransition } from "react";
import {
  createWorkout,
  updateVariation,
  type BlockInput,
  type ExerciseInput,
  type WorkoutInput,
} from "@/app/actions";
import {
  blockLabel,
  blocksToItems,
  itemsToBlocks,
  type BuilderBlock,
  type BuilderItem,
} from "@/lib/workout";
import { NumberSelect } from "@/components/NumberSelect";

let clientId = 0;
const nextKey = () => `new-${++clientId}`;

type ExerciseDraft = Omit<ExerciseInput, "sets"> & { key: string };

const emptyExercise = (): ExerciseDraft => ({
  key: nextKey(),
  name: "",
  measurement: "reps",
  repScheme: "fixed",
  repsMin: 10,
  repsMax: 15,
  timeSeconds: 30,
  restOverrideSeconds: null,
  note: null,
  weightUnit: "kg" as const,
  targetWeight: null,
});

const field =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-zinc-100 " +
  "placeholder:text-zinc-600 transition focus:border-lime-400 focus:outline-none";

export function WorkoutBuilder({
  variationId,
  initial,
  nameLabel = "Workout name",
}: {
  variationId?: string;
  initial?: { name: string; defaultRestSeconds: number; blocks: BlockInput[] };
  nameLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rest, setRest] = useState(initial?.defaultRestSeconds ?? 90);
  const [items, setItems] = useState<BuilderItem<ExerciseDraft>[]>(() =>
    initial
      ? blocksToItems(
          initial.blocks.map((b) => ({
            id: b.id,
            exercises: b.exercises.map((e) => ({
              ...e,
              key: e.id ?? nextKey(),
              sectionName: b.sectionName ?? null,
            })),
          })),
          nextKey,
        )
      : [{ kind: "block", key: nextKey(), sets: 3, exercises: [emptyExercise()] }],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const patchBlock = (bi: number, patch: Partial<BuilderBlock<ExerciseDraft>>) =>
    setItems((its) => its.map((it, i) => (i === bi && it.kind === "block" ? { ...it, ...patch } : it)));
  const patchExercise = (bi: number, ei: number, patch: Partial<ExerciseDraft>) =>
    setItems((its) =>
      its.map((it, i) =>
        i === bi && it.kind === "block"
          ? { ...it, exercises: it.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) }
          : it,
      ),
    );

  const save = () => {
    const blocks = itemsToBlocks(items);
    const payload: WorkoutInput = {
      name,
      defaultRestSeconds: rest,
      blocks: blocks.map((b) => ({
        id: b.id,
        sectionName: b.sectionName,
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
          note: e.note,
          weightUnit: e.weightUnit,
          targetWeight: e.targetWeight,
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
        if (variationId) await updateVariation(variationId, payload);
        else await createWorkout(payload);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e; // Next redirect
        setError("Could not save the workout. Please try again.");
      }
    });
  };

  const blockNumbers = items.reduce<number[]>((acc, it) => {
    acc.push(it.kind === "block" ? (acc.at(-1) ?? 0) + 1 : acc.at(-1) ?? 0);
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-5 pb-28">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-zinc-400">{nameLabel}</span>
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Push day"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-zinc-400">Default rest between sets (seconds)</span>
        <NumberSelect
          min={0}
          max={300}
          step={5}
          value={`${rest}`}
          onChange={(v) => setRest(Number(v))}
        />
      </label>

      {items.map((item, bi) => {
        if (item.kind === "divider") {
          return (
            <div
              key={item.key}
              className="flex items-center gap-2 border-l-2 border-lime-400 bg-lime-400/5 py-2 pl-3 pr-2"
            >
              <input
                className="w-full flex-1 bg-transparent text-xs font-semibold uppercase tracking-[0.15em] text-lime-400 placeholder:text-lime-400/40 focus:outline-none"
                value={item.name}
                onChange={(ev) =>
                  setItems((its) =>
                    its.map((it, i) =>
                      i === bi && it.kind === "divider" ? { ...it, name: ev.target.value } : it,
                    ),
                  )
                }
                placeholder="Muscle group, e.g. Biceps"
              />
              <div className="flex gap-1 text-zinc-400">
                <IconButton
                  label="Move up"
                  disabled={bi === 0}
                  onClick={() =>
                    setItems((its) => {
                      const copy = [...its];
                      [copy[bi - 1], copy[bi]] = [copy[bi], copy[bi - 1]];
                      return copy;
                    })
                  }
                >
                  ↑
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={bi === items.length - 1}
                  onClick={() =>
                    setItems((its) => {
                      const copy = [...its];
                      [copy[bi + 1], copy[bi]] = [copy[bi], copy[bi + 1]];
                      return copy;
                    })
                  }
                >
                  ↓
                </IconButton>
                <IconButton
                  label="Remove muscle group"
                  onClick={() => setItems((its) => its.filter((_, i) => i !== bi))}
                >
                  ✕
                </IconButton>
              </div>
            </div>
          );
        }

        const block = item;
        const blockNumber = blockNumbers[bi];

        return (
          <section
            key={block.key}
            className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4"
          >
            <header className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
                {blockNumber}. {blockLabel(block.exercises.length)}
              </h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Sets</span>
                  <NumberSelect
                    min={1}
                    max={10}
                    step={1}
                    value={`${block.sets}`}
                    onChange={(v) => patchBlock(bi, { sets: Number(v) })}
                  />
                </label>
                <div className="flex gap-1 text-zinc-400">
                  <IconButton
                    label="Move up"
                    disabled={bi === 0}
                    onClick={() =>
                      setItems((its) => {
                        const copy = [...its];
                        [copy[bi - 1], copy[bi]] = [copy[bi], copy[bi - 1]];
                        return copy;
                      })
                    }
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={bi === items.length - 1}
                    onClick={() =>
                      setItems((its) => {
                        const copy = [...its];
                        [copy[bi + 1], copy[bi]] = [copy[bi], copy[bi + 1]];
                        return copy;
                      })
                    }
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    label="Remove block"
                    onClick={() => setItems((its) => its.filter((_, i) => i !== bi))}
                  >
                    ✕
                  </IconButton>
                </div>
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
                          setItems((its) =>
                            its.map((it, i) =>
                              i === bi && it.kind === "block"
                                ? { ...it, exercises: it.exercises.filter((_, j) => j !== ei) }
                                : it,
                            ),
                          )
                        }
                      >
                        ✕
                      </IconButton>
                    )}
                  </div>

                  <input
                    className={field}
                    value={e.note ?? ""}
                    onChange={(ev) =>
                      patchExercise(bi, ei, { note: ev.target.value || null })
                    }
                    placeholder="Note (e.g. + barbell, use the cable pulley)"
                  />

                  <div className="grid grid-cols-2 gap-2">
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
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Weight unit</span>
                      <select
                        className={field}
                        value={e.weightUnit}
                        onChange={(ev) =>
                          patchExercise(bi, ei, {
                            weightUnit: ev.target.value as "kg" | "bricks",
                          })
                        }
                      >
                        <option value="kg">Kilograms</option>
                        <option value="bricks">Bricks (machine stack)</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Target weight ({e.weightUnit === "bricks" ? "bricks" : "kg"})</span>
                      <NumberSelect
                        min={e.weightUnit === "bricks" ? 1 : 0}
                        max={e.weightUnit === "bricks" ? 25 : 300}
                        step={e.weightUnit === "bricks" ? 1 : 2.5}
                        blank
                        value={e.targetWeight == null ? "" : `${e.targetWeight}`}
                        onChange={(v) =>
                          patchExercise(bi, ei, {
                            targetWeight: v === "" ? null : Number(v),
                          })
                        }
                      />
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
                            <NumberSelect
                              min={1}
                              max={50}
                              step={1}
                              value={e.repsMin == null ? "" : `${e.repsMin}`}
                              onChange={(v) => patchExercise(bi, ei, { repsMin: Number(v) })}
                            />
                          </label>
                        )}
                        {e.repScheme === "range" && (
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">From</span>
                              <NumberSelect
                                min={1}
                                max={50}
                                step={1}
                                value={e.repsMin == null ? "" : `${e.repsMin}`}
                                onChange={(v) => patchExercise(bi, ei, { repsMin: Number(v) })}
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">To</span>
                              <NumberSelect
                                min={1}
                                max={50}
                                step={1}
                                value={e.repsMax == null ? "" : `${e.repsMax}`}
                                onChange={(v) => patchExercise(bi, ei, { repsMax: Number(v) })}
                              />
                            </label>
                          </div>
                        )}
                      </>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">Duration (seconds)</span>
                        <NumberSelect
                          min={5}
                          max={300}
                          step={5}
                          value={e.timeSeconds == null ? "" : `${e.timeSeconds}`}
                          onChange={(v) => patchExercise(bi, ei, { timeSeconds: Number(v) })}
                        />
                      </label>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Rest override (s)</span>
                      <NumberSelect
                        min={0}
                        max={300}
                        step={5}
                        blank
                        blankLabel="default"
                        value={e.restOverrideSeconds == null ? "" : `${e.restOverrideSeconds}`}
                        onChange={(v) =>
                          patchExercise(bi, ei, {
                            restOverrideSeconds: v === "" ? null : Number(v),
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
                  setItems((its) =>
                    its.map((it, i) =>
                      i === bi && it.kind === "block"
                        ? { ...it, exercises: [...it.exercises, emptyExercise()] }
                        : it,
                    ),
                  )
                }
              >
                + Pair exercise ({blockLabel(block.exercises.length + 1).toLowerCase()})
              </button>
            )}
          </section>
        );
      })}

      <div className="flex gap-3">
        <button
          type="button"
          className="flex-1 rounded-2xl border border-dashed border-zinc-700 py-4 font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
          onClick={() =>
            setItems((its) => [
              ...its,
              { kind: "block", key: nextKey(), sets: 3, exercises: [emptyExercise()] },
            ])
          }
        >
          + Add exercise block
        </button>
        <button
          type="button"
          className="flex-1 rounded-2xl border border-dashed border-zinc-700 py-4 font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
          onClick={() =>
            setItems((its) => [...its, { kind: "divider", key: nextKey(), name: "" }])
          }
        >
          + Muscle group
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="mx-auto block w-full max-w-md rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Saving…" : variationId ? "Save changes" : "Create workout"}
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
