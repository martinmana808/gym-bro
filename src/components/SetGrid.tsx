"use client";

import {
  blockLabel,
  formatSeconds,
  formatWeight,
  type RunnerBlock,
  type SetEntry,
} from "@/lib/workout";

const cellKey = (exerciseId: string, setNumber: number) => `${exerciseId}#${setNumber}`;

/**
 * Whole-day grid: one row per exercise, one tappable cell per set.
 * Pure display — the parent decides what a tap means (jump / edit).
 */
export function SetGrid({
  blocks,
  entries,
  activeKey,
  onCellTap,
}: {
  blocks: RunnerBlock[];
  entries: SetEntry[];
  activeKey?: string | null;
  onCellTap: (exerciseId: string, setNumber: number) => void;
}) {
  const byKey = new Map(entries.map((e) => [cellKey(e.exerciseId, e.setNumber), e]));
  return (
    <div className="flex flex-col gap-4">
      {blocks
        .filter((b) => b.exercises.length > 0)
        .map((block) => (
          <div key={block.id} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3">
            {block.exercises.length > 1 && (
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
                {blockLabel(block.exercises.length)}
              </p>
            )}
            {block.exercises.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1">
                <span className="w-28 shrink-0 truncate text-sm font-medium">{e.name}</span>
                <div className="flex flex-1 gap-1.5 overflow-x-auto">
                  {Array.from({ length: e.sets }, (_, i) => {
                    const setNumber = i + 1;
                    const entry = byKey.get(cellKey(e.id, setNumber));
                    const active = activeKey === cellKey(e.id, setNumber);
                    return (
                      <button
                        key={setNumber}
                        type="button"
                        onClick={() => onCellTap(e.id, setNumber)}
                        className={`min-w-14 rounded-lg border px-2 py-2 text-center text-sm tabular-nums transition ${
                          active
                            ? "border-lime-400 text-lime-400"
                            : entry
                              ? "border-zinc-700 bg-zinc-800/60 text-zinc-100"
                              : "border-zinc-800 text-zinc-600"
                        }`}
                      >
                        {entry
                          ? entry.timeSeconds != null
                            ? formatSeconds(entry.timeSeconds)
                            : entry.weight != null
                              ? `${formatWeight(entry.weight, e.weightUnit)}×${entry.hitTarget ? "OK" : (entry.reps ?? "?")}`
                              : entry.hitTarget
                                ? "OK"
                                : `${entry.reps ?? "?"}`
                          : "·"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
