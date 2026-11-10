import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getSessionData } from "@/db/queries";
import { deleteSession } from "@/app/actions";
import { SessionRunner, type LogEntry } from "@/components/SessionRunner";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { FinishedSets } from "@/components/FinishedSets";
import { formatClock, sessionTotals } from "@/lib/workout";
import { completionOf, type Completion, type CompletionExercise } from "@/lib/completion";

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
        programId={structure.workout.programId}
        workoutId={structure.workout.id}
        startedAtMs={session.startedAt.getTime()}
        restEndsAtMs={session.restEndsAt ? session.restEndsAt.getTime() : null}
        initialPausedAtMs={session.pausedAt ? session.pausedAt.getTime() : null}
        initialPausedMs={session.pausedMs}
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

  // Finished: summary view. Time spent paused doesn't count as workout time.
  const durationSeconds =
    (session.finishedAt.getTime() - session.startedAt.getTime() - session.pausedMs) / 1000;
  const allExercises = structure.blocks.flatMap((b) => b.exercises);
  const unitOf = new Map(allExercises.map((e) => [e.id, e.weightUnit]));
  const totals = sessionTotals(logs.map((l) => ({ ...l, weightUnit: unitOf.get(l.exerciseId) })));
  const completion = completionOf(
    allExercises.map((e) => ({
      exercise: e as CompletionExercise,
      logs: logs
        .filter((l) => l.exerciseId === e.id)
        .map((l) => ({
          setNumber: l.setNumber,
          weight: l.weight,
          reps: l.reps,
          timeSeconds: l.timeSeconds,
        })),
    })),
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${structure.workout.programId}/days/${structure.workout.id}`}
          aria-label="Back to workout"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/60 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
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

      {completion.percent != null && (
        <CompletionCard completion={completion} />
      )}

      <div className="grid grid-cols-2 gap-3 text-center">
        <Tile label="duration" value={durationSeconds > 0 ? formatClock(durationSeconds) : "—"} />
        <Tile label="sets" value={totals.sets} />
        <Tile label="reps" value={totals.reps} />
        <Tile
          label="kg lifted"
          value={totals.volume > 0 ? Math.round(totals.volume).toLocaleString() : "—"}
        />
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
          className="text-sm text-zinc-500 transition hover:text-red-400"
        >
          Delete session
        </ConfirmSubmit>
      </form>
    </main>
  );
}

/**
 * Expectation versus reality for the session: the work the plan asked for
 * against the work actually done. Over 100% is not a rounding error — it means
 * the targets have been outgrown, so it says so in words.
 */
function CompletionCard({ completion }: { completion: Completion }) {
  const pct = completion.percent!;
  const above = pct > 100;
  const note = above
    ? "Above plan — time to raise your targets."
    : pct === 100
      ? "Exactly to plan."
      : completion.skippedSets > 0
        ? `${completion.skippedSets} set${completion.skippedSets === 1 ? "" : "s"} not done.`
        : "Short on weight or reps.";

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="section-label">completion</p>
        <p
          className={`display-num text-4xl font-bold leading-none ${
            above ? "text-lime-400" : "text-zinc-100"
          }`}
        >
          {pct}%
        </p>
      </div>
      {/* The bar fills to 100 and the overshoot rides past it in a lighter
          tone, so beating the plan still reads as a full bar plus extra. */}
      <div className="well mt-3 h-2 w-full overflow-hidden p-0">
        <div className="flex h-full w-full">
          <div
            className="h-full bg-lime-400"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
          {above && (
            <div
              className="h-full bg-lime-400/40"
              style={{ width: `${Math.min(100, pct - 100)}%` }}
            />
          )}
        </div>
      </div>
      <p className="mt-2.5 text-sm text-zinc-400">{note}</p>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <p className="display-num text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-[0.15em] text-zinc-400">{label}</p>
    </div>
  );
}
