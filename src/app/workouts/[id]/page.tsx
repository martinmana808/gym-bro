import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import {
  getUnfinishedSession,
  getVariationStructure,
  getWorkoutHistory,
  listDayVariations,
} from "@/db/queries";
import { deleteWorkout, startSession } from "@/app/actions";
import {
  blockLabel,
  formatClock,
  formatCurrentWeight,
  formatSeconds,
  formatSessionCell,
  formatTarget,
  formatTargetWeight,
} from "@/lib/workout";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { VariationsBar } from "@/components/VariationsBar";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const userId = await requireUserId();
  const [variations, history, unfinished] = await Promise.all([
    listDayVariations(id, userId),
    getWorkoutHistory(id),
    getUnfinishedSession(id, userId),
  ]);
  const activeId =
    (v && variations.some((va) => va.id === v) ? v : undefined) ??
    history.sessions[0]?.variationId ??
    variations[0]?.id;
  if (!activeId) notFound();
  const structure = await getVariationStructure(activeId, userId);
  if (!structure) notFound();
  const { workout, blocks } = structure;
  // Oldest → newest, like the week columns of the spreadsheet.
  const columns = [...history.sessions].reverse();
  const exercisesInOrder = blocks.flatMap((b) => b.exercises);
  // Which block each exercise belongs to, so the history table can mark
  // supersets/trisets the same way the plan groups them.
  const groupOf = new Map<string, { size: number; label: string; firstId: string; lastId: string }>();
  for (const b of blocks) {
    for (const e of b.exercises) {
      groupOf.set(e.id, {
        size: b.exercises.length,
        label: blockLabel(b.exercises.length),
        firstId: b.exercises[0].id,
        lastId: b.exercises[b.exercises.length - 1].id,
      });
    }
  }
  const currentWeight = (exerciseId: string): number | null => {
    for (const s of history.sessions) {
      const w = (history.logsBySession[s.id] ?? [])
        .filter((l) => l.exerciseId === exerciseId && l.weight != null)
        .at(-1)?.weight;
      if (w != null) return w;
    }
    return null;
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/workouts"
          aria-label="Back to workouts"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{workout.name}</h1>
          <p className="text-sm text-zinc-400">
            Default rest: {formatSeconds(workout.defaultRestSeconds)}
          </p>
        </div>
        <Link
          href={`/workouts/${workout.id}/edit?v=${activeId}`}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500"
        >
          Edit
        </Link>
      </header>

      {variations.length > 0 && (
        <VariationsBar
          dayId={id}
          variations={variations.map((va) => ({ id: va.id, name: va.name }))}
          activeId={activeId}
        />
      )}

      {unfinished ? (
        <Link
          href={`/sessions/${unfinished.id}`}
          className="rounded-2xl bg-amber-400 py-3.5 text-center font-bold text-zinc-950 shadow-lg shadow-amber-400/15 transition hover:bg-amber-300 active:scale-[0.98]"
        >
          Resume session in progress
        </Link>
      ) : (
        <form action={startSession.bind(null, workout.id, activeId)}>
          <button className="w-full rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98]">
            Start workout
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Plan
        </h2>
        <div className="flex flex-col gap-3">
          {blocks.map((block, i) => {
            const section = block.exercises[0]?.sectionName ?? null;
            const prevSection = i > 0 ? (blocks[i - 1].exercises[0]?.sectionName ?? null) : null;
            const showHeader = section && section !== prevSection;
            return (
              <div key={block.id} className="flex flex-col gap-1">
                {showHeader && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">
                    {section}
                  </p>
                )}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
                  {block.exercises.length > 1 && (
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      {blockLabel(block.exercises.length)}
                    </p>
                  )}
                  {block.exercises.map((e) => (
                    <div key={e.id} className="flex items-baseline justify-between gap-3 py-1">
                      <span className="font-medium">{e.name}</span>
                      <span className="whitespace-nowrap text-sm text-zinc-400">
                        {formatTarget(e)}
                        {e.targetWeight != null && ` · ${formatTargetWeight(e)}`}
                        {e.restOverrideSeconds != null && ` · rest ${formatSeconds(e.restOverrideSeconds)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {blocks.length === 0 && (
            <p className="text-sm text-zinc-500">No exercises yet — hit Edit to add some.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          History
        </h2>
        {columns.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No finished sessions yet. Your logged sets will show up here, one column per session —
            just like the spreadsheet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-zinc-400">
                  <th className="px-3 py-2.5 font-medium">Exercise</th>
                  <th className="px-3 py-2.5 font-medium">Target</th>
                  <th className="px-3 py-2.5 font-medium">Weight</th>
                  {columns.map((s) => {
                    const durationSeconds = s.finishedAt
                      ? (s.finishedAt.getTime() - s.startedAt.getTime()) / 1000
                      : 0;
                    return (
                      <th key={s.id} className="px-3 py-2 font-medium align-top">
                        <Link
                          href={`/sessions/${s.id}`}
                          className="block transition hover:text-lime-400"
                        >
                          {s.startedAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                          <span className="block text-[11px] font-normal tabular-nums text-zinc-500">
                            {durationSeconds > 0 ? formatClock(durationSeconds) : "—"}
                          </span>
                          {history.variationNameBySession[s.id] && (
                            <span className="block text-[11px] font-normal text-zinc-600">
                              {history.variationNameBySession[s.id]}
                            </span>
                          )}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {exercisesInOrder.map((e, idx) => {
                  const group = groupOf.get(e.id);
                  const grouped = (group?.size ?? 1) > 1;
                  const section = e.sectionName ?? null;
                  const prevSection = idx > 0 ? (exercisesInOrder[idx - 1].sectionName ?? null) : null;
                  const showSection = section && section !== prevSection;
                  return (
                    <Fragment key={e.id}>
                      {showSection && (
                        <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                          <td
                            colSpan={3 + columns.length}
                            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
                          >
                            {section}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-zinc-800/60 last:border-0 even:bg-zinc-900/30">
                        <td
                          className={`px-3 py-2.5 font-medium ${
                            grouped ? "border-l-2 border-lime-400/50" : ""
                          }`}
                        >
                          {e.name}
                          {grouped && group?.firstId === e.id && (
                            <span className="ml-2 rounded bg-lime-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-400/80">
                              {group.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400">{formatTarget(e)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                          {formatCurrentWeight(currentWeight(e.id), e.weightUnit)}
                        </td>
                        {columns.map((s) => {
                          const logs = (history.logsBySession[s.id] ?? []).filter(
                            (l) => l.exerciseId === e.id,
                          );
                          const note = (history.notesBySession[s.id] ?? []).find(
                            (n) => n.exerciseId === e.id,
                          )?.note;
                          return (
                            <td key={s.id} className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                              {formatSessionCell(logs, e.weightUnit, currentWeight(e.id))}
                              {note && (
                                <span title={note} className="ml-0.5 cursor-help text-lime-400">
                                  *
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form action={deleteWorkout.bind(null, workout.id)} className="mt-auto pt-4 text-center">
        <ConfirmSubmit
          message={`Delete "${workout.name}" and all its history? This cannot be undone.`}
          className="text-sm text-zinc-600 transition hover:text-red-400"
        >
          Delete workout
        </ConfirmSubmit>
      </form>
    </main>
  );
}
