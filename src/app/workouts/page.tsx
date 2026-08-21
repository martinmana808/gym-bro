import Link from "next/link";
import { requireUserId } from "@/auth";
import { listPrograms } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const userId = await requireUserId();
  const workouts = await listPrograms(userId);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-600">🏋️ Gym Bro</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Workouts</h1>
      </header>

      {workouts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
          <p className="text-3xl">💪</p>
          <p className="mt-3 font-semibold text-zinc-700">No workouts yet</p>
          <p className="mt-1 text-sm">Create your first plan — days, weeks, exercises.</p>
        </div>
      )}

      {workouts.map((w) => (
        <div
          key={w.id}
          className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300"
        >
          <Link href={`/workouts/${w.id}`} className="block">
            <h2 className="text-xl font-semibold tracking-tight">{w.name}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {w.dayCount} day{w.dayCount === 1 ? "" : "s"}
              {w.lastFinishedAt &&
                ` · last done ${w.lastFinishedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </p>
          </Link>
          <div className="mt-4 flex gap-2">
            {w.unfinishedSessionId ? (
              <Link
                href={`/sessions/${w.unfinishedSessionId}`}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-center font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 active:scale-[0.98]"
              >
                Resume session
              </Link>
            ) : (
              <Link
                href={`/workouts/${w.id}`}
                className="flex-1 rounded-xl bg-lime-400 py-2.5 text-center font-bold text-zinc-950 shadow-lg shadow-lime-500/20 transition hover:bg-lime-300 active:scale-[0.98]"
              >
                Open
              </Link>
            )}
            <Link
              href={`/workouts/${w.id}`}
              className="rounded-xl border border-zinc-300 px-4 py-2.5 text-zinc-600 transition hover:border-zinc-400"
            >
              Days
            </Link>
          </div>
        </div>
      ))}

      <Link
        href="/workouts/new"
        className="rounded-2xl border border-dashed border-zinc-300 py-4 text-center font-medium text-zinc-500 transition hover:border-lime-500 hover:text-lime-600"
      >
        + New workout
      </Link>

    </main>
  );
}
