import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import {
  getDayCellVariationId,
  getUnfinishedSession,
  getVariationStructure,
  getWorkoutHistory,
  listDayVariations,
} from "@/db/queries";
import { startSession } from "@/app/actions";
import {
  blockLabel,
  formatClock,
  formatCurrentWeight,
  formatSeconds,
  formatExerciseSessionCell,
  formatTarget,
  formatTargetWeight,
} from "@/lib/workout";
import { deriveWeeks } from "@/lib/weeks";
import { WeekTabs } from "@/components/WeekTabs";

export const dynamic = "force-dynamic";

export default async function DayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; dayId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id: programId, dayId } = await params;
  const { week } = await searchParams;
  const userId = await requireUserId();

  // Derive the day's weeks from its variations (kept aligned program-wide).
  const dayVariations = await listDayVariations(dayId, userId);
  if (!dayVariations.length) notFound();
  const weeks = deriveWeeks([dayVariations.map((v) => ({ position: v.position, name: v.name }))]);
  const wanted = week != null && week !== "" ? Number(week) : undefined;
  const selectedWeek =
    wanted != null && weeks.some((w) => w.position === wanted)
      ? wanted
      : weeks[weeks.length - 1].position;

  const cellVariationId = await getDayCellVariationId(dayId, selectedWeek, userId);
  if (!cellVariationId) notFound();
  const [structure, history, unfinished] = await Promise.all([
    getVariationStructure(cellVariationId, userId),
    getWorkoutHistory(dayId, cellVariationId),
    getUnfinishedSession(dayId, userId),
  ]);
  if (!structure) notFound();
  const { workout, blocks } = structure;

  // Only this week's sessions (its cell has its own exercise ids).
  const columns = history.sessions.filter((s) => s.variationId === cellVariationId).reverse();
  const exercisesInOrder = blocks.flatMap((b) => b.exercises);
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
    for (const s of columns.slice().reverse()) {
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
          href={`/workouts/${programId}`}
          aria-label="Back to workout"
          className="btn btn-ghost size-10 shrink-0 rounded-full text-lg"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{workout.name}</h1>
          <p className="text-sm text-zinc-500">
            Rest <span className="metric">{formatSeconds(workout.defaultRestSeconds)}</span>
          </p>
        </div>
        <Link
          href={`/workouts/${programId}/days/${dayId}/edit?week=${selectedWeek}`}
          className="btn btn-ghost rounded-full px-4 py-2 text-sm"
        >
          Edit
        </Link>
      </header>

      <WeekTabs
        programId={programId}
        weeks={weeks}
        selectedWeek={selectedWeek}
        basePath={`/workouts/${programId}/days/${dayId}`}
      />

      {/* Nothing to show while a session is running — the fixed bar at the
          bottom of the screen already says so and links straight into it. */}
      {!unfinished && (
        <form action={startSession.bind(null, dayId, cellVariationId)}>
          <button className="btn btn-primary w-full py-3.5 text-base">
            Start workout
          </button>
        </form>
      )}

      <section>
        <div className="flex flex-col gap-3">
          {blocks.map((block, i) => {
            const section = block.exercises[0]?.sectionName ?? null;
            const prevSection = i > 0 ? (blocks[i - 1].exercises[0]?.sectionName ?? null) : null;
            const showHeader = section && section !== prevSection;
            return (
              <div key={block.id} className="flex flex-col">
                {/* Same left padding as the cards below, so the whole plan
                    column lines up whether or not a block is a superset. */}
                {showHeader && (
                  <p className="section-label mb-2 mt-3 pl-1">
                    {section}
                  </p>
                )}
                <div className="card divide-y divide-white/5">
                  {block.exercises.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-zinc-300">
                        {e.name}
                      </span>
                      <span className="metric whitespace-nowrap text-sm text-zinc-100">
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
            <p className="text-sm text-zinc-400">No exercises yet — hit Edit to add some.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">History</h2>
        {columns.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No finished sessions in this week yet. Your logged sets will show up here, one column per
            session.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
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
                        <Link href={`/sessions/${s.id}`} className="block transition hover:text-zinc-100">
                          {s.startedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          <span className="block text-[11px] font-normal metric text-zinc-400">
                            {durationSeconds > 0 ? formatClock(durationSeconds) : "—"}
                          </span>
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
                        <tr className="border-b border-zinc-800 bg-zinc-950">
                          <td
                            colSpan={3 + columns.length}
                            className="border-l-2 border-lime-400 px-3 py-1.5 section-label"
                          >
                            {section}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-zinc-800 last:border-0 even:bg-zinc-900/30">
                        <td className={`px-3 py-2.5 font-medium ${grouped ? "border-l-2 border-lime-400/50" : ""}`}>
                          {e.name}
                          {grouped && group?.firstId === e.id && (
                            <span className="ml-2 rounded bg-lime-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-400/80">
                              {group.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400">{formatTarget(e)}</td>
                        <td className="px-3 py-2.5 metric text-zinc-300">
                          {formatCurrentWeight(currentWeight(e.id), e.weightUnit)}
                        </td>
                        {columns.map((s) => {
                          const logs = (history.logsBySession[s.id] ?? []).filter((l) => l.exerciseId === e.id);
                          const note = (history.notesBySession[s.id] ?? []).find((n) => n.exerciseId === e.id)?.note;
                          return (
                            <td key={s.id} className="whitespace-nowrap px-3 py-2.5 metric">
                              {formatExerciseSessionCell(e, logs)}
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
    </main>
  );
}
