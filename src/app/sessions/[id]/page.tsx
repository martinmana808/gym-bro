import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getSessionData } from "@/db/queries";
import { deleteSession } from "@/app/actions";
import { SessionRunner, type LogEntry } from "@/components/SessionRunner";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { formatClock, formatLoggedSet } from "@/lib/workout";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const data = await getSessionData(id, userId);
  if (!data) notFound();
  const { session, structure, logs, previousLogs } = data;

  const toEntry = (l: (typeof logs)[number]): LogEntry => ({
    exerciseId: l.exerciseId,
    setNumber: l.setNumber,
    weightKg: l.weightKg,
    reps: l.reps,
    timeSeconds: l.timeSeconds,
  });

  if (!session.finishedAt) {
    return (
      <SessionRunner
        sessionId={session.id}
        workoutName={structure.workout.name}
        startedAtMs={session.startedAt.getTime()}
        defaultRestSeconds={structure.workout.defaultRestSeconds}
        blocks={structure.blocks.map((b) => ({
          id: b.id,
          exercises: b.exercises,
        }))}
        initialLogs={logs.map(toEntry)}
        previousLogs={previousLogs.map(toEntry)}
      />
    );
  }

  // Finished: summary view.
  const durationSeconds = (session.finishedAt.getTime() - session.startedAt.getTime()) / 1000;
  const exercisesInOrder = structure.blocks.flatMap((b) => b.exercises);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${structure.workout.id}`}
          className="text-zinc-500 hover:text-zinc-300"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{structure.workout.name}</h1>
          <p className="text-sm text-zinc-400">
            {session.startedAt.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-3xl font-bold tabular-nums">{formatClock(durationSeconds)}</p>
          <p className="text-sm text-zinc-400">duration</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-3xl font-bold tabular-nums">{logs.length}</p>
          <p className="text-sm text-zinc-400">sets logged</p>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        {exercisesInOrder.map((e) => {
          const mine = logs
            .filter((l) => l.exerciseId === e.id)
            .sort((a, b) => a.setNumber - b.setNumber);
          if (!mine.length) return null;
          return (
            <div
              key={e.id}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2"
            >
              <span className="font-medium">{e.name}</span>
              <span className="whitespace-nowrap text-sm tabular-nums text-zinc-300">
                {mine.map(formatLoggedSet).join(" · ")}
              </span>
            </div>
          );
        })}
        {logs.length === 0 && <p className="text-sm text-zinc-500">No sets were logged.</p>}
      </section>

      <form action={deleteSession.bind(null, session.id)} className="mt-auto pt-4">
        <ConfirmSubmit
          message="Delete this session and its logged sets?"
          className="text-sm text-red-400/80 hover:text-red-400"
        >
          Delete session
        </ConfirmSubmit>
      </form>
    </main>
  );
}
