"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateVariationTargets, type TargetEdit } from "@/app/actions";
import { NumberSelect } from "@/components/NumberSelect";
import { blockLabel } from "@/lib/workout";
import type { WeightUnit } from "@/lib/workout";

export type TargetRow = {
  id: string;
  name: string;
  sectionName: string | null;
  measurement: "reps" | "time";
  repScheme: "fixed" | "range" | "failure" | null;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  timeSeconds: number | null;
  weightUnit: WeightUnit;
  targetWeight: number | null;
};

export type TargetBlock = { id: string; exercises: TargetRow[] };

type Draft = Record<string, { sets: string; weight: string; reps: string; repsMax: string; seconds: string }>;

const str = (n: number | null) => (n == null ? "" : String(n));

/**
 * Editor for a progression week: the exercises are fixed, only the numbers move.
 *
 * Week after week the plan is the same lifts with different loads, so this
 * prefills every field with what the week already has and lets you nudge it.
 * Adding, removing or reordering exercises stays on the first week.
 */
export function WeekTargetsEditor({
  variationId,
  blocks,
}: {
  variationId: string;
  blocks: TargetBlock[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      blocks.flatMap((b) =>
        b.exercises.map((e) => [
          e.id,
          {
            sets: String(e.sets),
            weight: str(e.targetWeight),
            reps: str(e.repsMin),
            repsMax: str(e.repsMax),
            seconds: str(e.timeSeconds),
          },
        ]),
      ),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (id: string, field: keyof Draft[string], v: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: v } }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const edits: TargetEdit[] = blocks.flatMap((b) =>
      b.exercises.map((e) => {
        const d = draft[e.id];
        return {
          exerciseId: e.id,
          sets: Number(d.sets) || e.sets,
          targetWeight: d.weight === "" ? null : Number(d.weight),
          repsMin: d.reps === "" ? null : Number(d.reps),
          repsMax: d.repsMax === "" ? null : Number(d.repsMax),
          timeSeconds: d.seconds === "" ? null : Number(d.seconds),
        };
      }),
    );
    try {
      await updateVariationTargets(variationId, edits); // redirects back to the day
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) return; // Next redirect
      setError("Could not save — try again.");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Same exercises as the week you copied — just dial in the numbers. Adding or removing
        exercises is done on the first week.
      </p>

      {blocks.map((block) => {
        const section = block.exercises[0]?.sectionName ?? null;
        return (
          <div key={block.id} className="flex flex-col gap-2">
            {section && (
              <p className="pl-4 text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
                {section}
              </p>
            )}
            <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
              {block.exercises.length > 1 && (
                <p className="-mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  {blockLabel(block.exercises.length)}
                </p>
              )}
              {block.exercises.map((e) => {
                const d = draft[e.id];
                return (
                  <div key={e.id} className="flex flex-col gap-2">
                    <p className="font-medium">{e.name}</p>
                    <div className="flex items-end gap-2">
                      <Field label="Sets">
                        <NumberSelect
                          value={d.sets}
                          onChange={(v) => set(e.id, "sets", v)}
                          min={1}
                          max={20}
                          step={1}
                          title={`${e.name} — sets`}
                        />
                      </Field>
                      <Field label={e.weightUnit === "bricks" ? "Bricks" : "Weight"}>
                        <NumberSelect
                          value={d.weight}
                          onChange={(v) => set(e.id, "weight", v)}
                          min={e.weightUnit === "bricks" ? 1 : 0}
                          max={e.weightUnit === "bricks" ? 25 : 300}
                          step={e.weightUnit === "bricks" ? 1 : 2.5}
                          blank
                          title={`${e.name} — weight`}
                        />
                      </Field>
                      {e.measurement === "time" ? (
                        <Field label="Seconds">
                          <NumberSelect
                            value={d.seconds}
                            onChange={(v) => set(e.id, "seconds", v)}
                            min={5}
                            max={300}
                            step={5}
                            title={`${e.name} — seconds`}
                          />
                        </Field>
                      ) : e.repScheme === "failure" ? (
                        <Field label="Reps">
                          <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-zinc-500">
                            to failure
                          </p>
                        </Field>
                      ) : (
                        <>
                          <Field label={e.repScheme === "range" ? "Reps from" : "Reps"}>
                            <NumberSelect
                              value={d.reps}
                              onChange={(v) => set(e.id, "reps", v)}
                              min={1}
                              max={60}
                              step={1}
                              title={`${e.name} — reps`}
                            />
                          </Field>
                          {e.repScheme === "range" && (
                            <Field label="to">
                              <NumberSelect
                                value={d.repsMax}
                                onChange={(v) => set(e.id, "repsMax", v)}
                                min={1}
                                max={60}
                                step={1}
                                title={`${e.name} — max reps`}
                              />
                            </Field>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="rounded-2xl border border-zinc-700 px-5 py-3 font-medium text-zinc-300 transition hover:border-zinc-500"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-2xl bg-lime-400 py-3 font-bold text-zinc-950 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save week"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
