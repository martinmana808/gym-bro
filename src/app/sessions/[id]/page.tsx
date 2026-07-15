import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getSessionData } from "@/db/queries";
import { deleteSession } from "@/app/actions";
import { SessionRunner, type LogEntry } from "@/components/SessionRunner";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { FinishedSets } from "@/components/FinishedSets";
import { formatClock } from "@/lib/workout";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const data = await getSessionData(id, userId);
  if (!data) notFound();
  const { session, structure, logs, previousLogs, notes } = data;

  const toEntry = (l: (typeof logs)[number]): LogEntry => ({
    exerciseId: l.exerciseId,
    setNumber: l.setNumber,
    weight: l.weight,
    reps: l.reps,
    timeSeconds: l.timeSeconds,
    hitTarget: l.hitTarget,
  });

  if (!session.finishedAt) {
    return (
      <SessionRunner
        sessionId={session.id}
        workoutId={structure.workout.id}
        workoutName={structure.workout.name}
        startedAtMs={session.startedAt.getTime()}
        defaultRestSeconds={structure.workout.defaultRestSeconds}
        blocks={structure.blocks.map((b) => ({
          id: b.id,
          exercises: b.exercises,
        }))}
        initialLogs={logs.map(toEntry)}
        previousLogs={previousLogs.map(toEntry)}
        initialNotes={notes.map((n) => ({ exerciseId: n.exerciseId, note: n.note }))}
      />
    );
  }

  // Finished: summary view.
  const durationSeconds = (session.finishedAt.getTime() - session.startedAt.getTime()) / 1000;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${structure.workout.id}`}
          aria-label="Back to workout"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{structure.workout.name}</h1>
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
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {durationSeconds > 0 ? formatClock(durationSeconds) : "—"}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
            duration
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
          <p className="text-3xl font-bold tabular-nums tracking-tight">{logs.length}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
            sets logged
          </p>
        </div>
      </div>

      <FinishedSets
        sessionId={session.id}
        blocks={structure.blocks.map((b) => ({ id: b.id, exercises: b.exercises }))}
        initialEntries={logs.map(toEntry)}
        notes={notes.map((n) => ({ exerciseId: n.exerciseId, note: n.note }))}
      />

      <form action={deleteSession.bind(null, session.id)} className="mt-auto pt-4 text-center">
        <ConfirmSubmit
          message="Delete this session and its logged sets?"
          className="text-sm text-zinc-600 transition hover:text-red-400"
        >
          Delete session
        </ConfirmSubmit>
      </form>
    </main>
  );
}
