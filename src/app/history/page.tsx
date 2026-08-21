import Link from "next/link";
import { requireUserId } from "@/auth";
import { listRecentSessions } from "@/db/queries";
import { formatClock } from "@/lib/workout";

export const dynamic = "force-dynamic";

/** Group by day so a week of training reads as a few dated blocks. */
function dayKey(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default async function HistoryPage() {
  const userId = await requireUserId();
  const sessions = await listRecentSessions(userId);

  const groups: { label: string; entries: typeof sessions }[] = [];
  for (const s of sessions) {
    const label = dayKey(s.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(s);
    else groups.push({ label, entries: [s] });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-600">🏋️ Gym Bro</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">History</h1>
      </header>

      {sessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
          <p className="text-3xl">📈</p>
          <p className="mt-3 font-semibold text-zinc-700">Nothing finished yet</p>
          <p className="mt-1 text-sm">Finish a workout and it shows up here.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {g.label}
          </h2>
          {g.entries.map((s) => (
            <Link
              key={s.sessionId}
              href={`/sessions/${s.sessionId}`}
              className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate font-semibold tracking-tight">{s.dayName}</h3>
                <span className="shrink-0 text-sm tabular-nums text-zinc-500">
                  {formatClock(s.durationSeconds)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-zinc-500">
                {[s.programName, s.weekName].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {s.setCount} set{s.setCount === 1 ? "" : "s"}
                {s.volume > 0 && ` · ${Math.round(s.volume).toLocaleString()} kg lifted`}
              </p>
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}
