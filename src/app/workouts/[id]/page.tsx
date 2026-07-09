import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getUnfinishedSession, getWorkoutHistory, getWorkoutStructure } from "@/db/queries";
import { deleteWorkout, startSession } from "@/app/actions";
import {
  blockLabel,
  formatCurrentWeight,
  formatSeconds,
  formatSessionCell,
  formatTarget,
} from "@/lib/workout";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const [structure, history, unfinished] = await Promise.all([
    getWorkoutStructure(id, userId),
    getWorkoutHistory(id),
    getUnfinishedSession(id, userId),
  ]);
  if (!structure) notFound();
  const { workout, blocks } = structure;
  // Oldest → newest, like the week columns of the spreadsheet.
  const columns = [...history.sessions].reverse();
  const exercisesInOrder = blocks.flatMap((b) => b.exercises);
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
          href={`/workouts/${workout.id}/edit`}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500"
        >
          Edit
        </Link>
      </header>

      {unfinished ? (
        <Link
          href={`/sessions/${unfinished.id}`}
          className="rounded-2xl bg-amber-400 py-3.5 text-center font-bold text-zinc-950 shadow-lg shadow-amber-400/15 transition hover:bg-amber-300 active:scale-[0.98]"
        >
          Resume session in progress
        </Link>
      ) : (
        <form action={startSession.bind(null, workout.id)}>
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
          {blocks.map((block) => (
            <div
              key={block.id}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4"
            >
              {block.exercises.length > 1 && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-lime-400">
                  {blockLabel(block.exercises.length)} — no rest in between
                </p>
              )}
              {block.exercises.map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="font-medium">{e.name}</span>
                  <span className="whitespace-nowrap text-sm text-zinc-400">
                    {formatTarget(e)}
                    {e.restOverrideSeconds != null &&
                      ` · rest ${formatSeconds(e.restOverrideSeconds)}`}
                  </span>
                </div>
              ))}
            </div>
          ))}
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
                  {columns.map((s) => (
                    <th key={s.id} className="px-3 py-2.5 font-medium">
                      <Link href={`/sessions/${s.id}`} className="transition hover:text-lime-400">
                        {s.startedAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exercisesInOrder.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-zinc-800/60 last:border-0 even:bg-zinc-900/30"
                  >
                    <td className="px-3 py-2.5 font-medium">{e.name}</td>
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
                ))}
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
