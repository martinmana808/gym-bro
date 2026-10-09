import Link from "next/link";
import { requireUserId } from "@/auth";
import { listPrograms } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const userId = await requireUserId();
  const workouts = await listPrograms(userId);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-6">
      {/* The tab bar already says where we are, so the page just needs a title. */}
      <h1 className="page-title">Workouts</h1>

      {workouts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="font-semibold text-zinc-200">No workouts yet</p>
          <p className="mt-1 text-sm text-zinc-500">Days, weeks, exercises — start with one.</p>
        </div>
      )}

      {workouts.map((w) => (
        <div key={w.id} className="card card-tap overflow-hidden">
          {/* The card is the link — a full-width green "Open" on every row
              would make the list a wall of green and say nothing extra. */}
          <Link
            href={`/workouts/${w.id}`}
            className="flex items-center gap-3 px-4 py-4"
          >
            <span className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight">{w.name}</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              <span className="metric">{w.dayCount}</span> day{w.dayCount === 1 ? "" : "s"}
              {w.lastFinishedAt && (
                <>
                  {" · last done "}
                  <span className="metric">
                    {w.lastFinishedAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </>
              )}
            </p>
            </span>
            <span className="shrink-0 text-lg text-zinc-600">›</span>
          </Link>
          {/* Only a live session earns a button here. */}
          {w.unfinishedSessionId && (
            <div className="px-4 pb-4">
              <Link
                href={`/sessions/${w.unfinishedSessionId}`}
                className="btn w-full bg-amber-400 py-2.5 text-zinc-950 hover:bg-amber-300"
              >
                Resume session
              </Link>
            </div>
          )}
        </div>
      ))}

      <Link
        href="/workouts/new"
        className="rounded-2xl border border-dashed border-zinc-800 py-3.5 text-center text-sm font-medium text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
      >
        + New workout
      </Link>
    </main>
  );
}
