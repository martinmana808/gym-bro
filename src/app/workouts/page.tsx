import Link from "next/link";
import { requireUserId, signOut } from "@/auth";
import { listWorkouts } from "@/db/queries";
import { startSession } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const userId = await requireUserId();
  const workouts = await listWorkouts(userId);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🏋️ Workouts</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="text-sm text-zinc-500 hover:text-zinc-300">Sign out</button>
        </form>
      </header>

      {workouts.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-400">
          <p className="mb-1 font-medium text-zinc-200">No workouts yet</p>
          <p className="text-sm">Create your first routine — exercises, sets, reps and rest.</p>
        </div>
      )}

      {workouts.map((w) => (
        <div key={w.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <Link href={`/workouts/${w.id}`} className="block">
            <h2 className="text-lg font-semibold hover:text-lime-400">{w.name}</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {w.exerciseCount} exercise{w.exerciseCount === 1 ? "" : "s"}
              {w.lastFinishedAt &&
                ` · last done ${w.lastFinishedAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`}
            </p>
          </Link>
          <div className="mt-3 flex gap-2">
            {w.unfinishedSessionId ? (
              <Link
                href={`/sessions/${w.unfinishedSessionId}`}
                className="flex-1 rounded-lg bg-amber-400 py-2 text-center font-semibold text-zinc-950 hover:bg-amber-300"
              >
                Resume session
              </Link>
            ) : (
              <form action={startSession.bind(null, w.id)} className="flex-1">
                <button className="w-full rounded-lg bg-lime-400 py-2 font-semibold text-zinc-950 hover:bg-lime-300">
                  Start
                </button>
              </form>
            )}
            <Link
              href={`/workouts/${w.id}`}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300 hover:border-zinc-500"
            >
              Details
            </Link>
          </div>
        </div>
      ))}

      <Link
        href="/workouts/new"
        className="rounded-xl border border-dashed border-zinc-700 py-3 text-center text-zinc-400 hover:border-lime-400 hover:text-lime-400"
      >
        + New workout
      </Link>
    </main>
  );
}
