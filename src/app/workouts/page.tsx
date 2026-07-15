import Link from "next/link";
import { requireUserId, signOut } from "@/auth";
import { listWorkouts } from "@/db/queries";
import { startSession } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const userId = await requireUserId();
  const workouts = await listWorkouts(userId);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-400">
            🏋️ Gym Bro
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Workouts</h1>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="text-sm text-zinc-500 transition hover:text-zinc-300">Sign out</button>
        </form>
      </header>

      {workouts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          <p className="text-3xl">💪</p>
          <p className="mt-3 font-semibold text-zinc-200">No workouts yet</p>
          <p className="mt-1 text-sm">Create your first routine — exercises, sets, reps and rest.</p>
        </div>
      )}

      {workouts.map((w) => (
        <div
          key={w.id}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 transition hover:border-zinc-700"
        >
          <Link href={`/workouts/${w.id}`} className="block">
            <h2 className="text-xl font-semibold tracking-tight">{w.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {w.exerciseCount} exercise{w.exerciseCount === 1 ? "" : "s"}
              {w.lastFinishedAt &&
                ` · last done ${w.lastFinishedAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`}
            </p>
          </Link>
          <div className="mt-4 flex gap-2">
            {w.unfinishedSessionId ? (
              <Link
                href={`/sessions/${w.unfinishedSessionId}`}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-center font-bold text-zinc-950 shadow-lg shadow-amber-400/15 transition hover:bg-amber-300 active:scale-[0.98]"
              >
                Resume session
              </Link>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await startSession(w.id);
                }}
                className="flex-1"
              >
                <button className="w-full rounded-xl bg-lime-400 py-2.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98]">
                  Start
                </button>
              </form>
            )}
            <Link
              href={`/workouts/${w.id}`}
              className="rounded-xl border border-zinc-700 px-4 py-2.5 text-zinc-300 transition hover:border-zinc-500"
            >
              Details
            </Link>
          </div>
        </div>
      ))}

      <Link
        href="/workouts/new"
        className="rounded-2xl border border-dashed border-zinc-700 py-4 text-center font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
      >
        + New workout
      </Link>

      <div className="flex justify-center gap-5 text-sm text-zinc-600">
        <Link href="/import" className="transition hover:text-zinc-300">
          Import spreadsheet
        </Link>
        <a href="/api/export" className="transition hover:text-zinc-300">
          Export CSV
        </a>
      </div>
    </main>
  );
}
