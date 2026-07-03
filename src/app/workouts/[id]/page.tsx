import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getUnfinishedSession, getWorkoutHistory, getWorkoutStructure } from "@/db/queries";
import { deleteWorkout, startSession } from "@/app/actions";
import { blockLabel, formatLoggedSet, formatSeconds, formatTarget } from "@/lib/workout";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const structure = await getWorkoutStructure(id, userId);
  if (!structure) notFound();
  const { workout, blocks } = structure;
  const [history, unfinished] = await Promise.all([
    getWorkoutHistory(id),
    getUnfinishedSession(id, userId),
  ]);
  // Oldest → newest, like the week columns of the spreadsheet.
  const columns = [...history.sessions].reverse();
  const exercisesInOrder = blocks.flatMap((b) => b.exercises);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href="/workouts" className="text-zinc-500 hover:text-zinc-300">
          ←
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{workout.name}</h1>
          <p className="text-sm text-zinc-400">
            Default rest: {formatSeconds(workout.defaultRestSeconds)}
          </p>
        </div>
        <Link
          href={`/workouts/${workout.id}/edit`}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
        >
          Edit
        </Link>
      </header>

      {unfinished ? (
        <Link
          href={`/sessions/${unfinished.id}`}
          className="rounded-xl bg-amber-400 py-3 text-center font-semibold text-zinc-950 hover:bg-amber-300"
        >
          Resume session in progress
        </Link>
      ) : (
        <form action={startSession.bind(null, workout.id)}>
          <button className="w-full rounded-xl bg-lime-400 py-3 font-semibold text-zinc-950 hover:bg-lime-300">
            Start workout
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Plan</h2>
        <div className="flex flex-col gap-3">
          {blocks.map((block, i) => (
            <div key={block.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              {block.exercises.length > 1 && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-lime-400">
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
              {i < blocks.length - 1 && null}
            </div>
          ))}
          {blocks.length === 0 && (
            <p className="text-sm text-zinc-500">No exercises yet — hit Edit to add some.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          History
        </h2>
        {columns.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No finished sessions yet. Your logged sets will show up here, one column per session —
            just like the spreadsheet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-zinc-400">
                  <th className="px-3 py-2 font-medium">Exercise</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  {columns.map((s) => (
                    <th key={s.id} className="px-3 py-2 font-medium">
                      <Link href={`/sessions/${s.id}`} className="hover:text-lime-400">
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
                  <tr key={e.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-zinc-400">{formatTarget(e)}</td>
                    {columns.map((s) => {
                      const logs = (history.logsBySession[s.id] ?? []).filter(
                        (l) => l.exerciseId === e.id,
                      );
                      return (
                        <td key={s.id} className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {logs.length ? logs.map(formatLoggedSet).join(" · ") : "—"}
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

      <form action={deleteWorkout.bind(null, workout.id)} className="mt-auto pt-4">
        <ConfirmSubmit
          message={`Delete "${workout.name}" and all its history? This cannot be undone.`}
          className="text-sm text-red-400/80 hover:text-red-400"
        >
          Delete workout
        </ConfirmSubmit>
      </form>
    </main>
  );
}
