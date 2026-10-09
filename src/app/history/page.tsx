import Link from "next/link";
import { requireUserId } from "@/auth";
import { getHistoryTotals, listRecentSessions } from "@/db/queries";
import { formatClock } from "@/lib/workout";

export const dynamic = "force-dynamic";

/** Group by day so a week of training reads as a few dated blocks. */
function dayKey(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default async function HistoryPage() {
  const userId = await requireUserId();
  const [sessions, totals] = await Promise.all([
    listRecentSessions(userId),
    getHistoryTotals(userId),
  ]);

  const groups: { label: string; entries: typeof sessions }[] = [];
  for (const s of sessions) {
    const label = dayKey(s.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(s);
    else groups.push({ label, entries: [s] });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-6">
      <h1 className="page-title">History</h1>

      {totals.sessions > 0 && (
        <section className="grid grid-cols-2 gap-3 text-center">
          <Tile label="workouts" value={totals.sessions} />
          <Tile label="sets" value={totals.sets.toLocaleString()} />
          <Tile label="reps" value={totals.reps.toLocaleString()} />
          <Tile
            label="kg lifted"
            value={totals.volume > 0 ? Math.round(totals.volume).toLocaleString() : "—"}
          />
        </section>
      )}

      {sessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          <p className="text-3xl">📈</p>
          <p className="mt-3 font-semibold text-zinc-200">Nothing finished yet</p>
          <p className="mt-1 text-sm">Finish a workout and it shows up here.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2">
          <h2 className="section-label">
            {g.label}
          </h2>
          {g.entries.map((s) => (
            <Link
              key={s.sessionId}
              href={`/sessions/${s.sessionId}`}
              className="card p-4 transition hover:border-zinc-700"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate font-semibold tracking-tight">{s.dayName}</h3>
                <span className="display-num shrink-0 text-sm text-zinc-400">
                  {formatClock(s.durationSeconds)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-zinc-400">
                {[s.programName, s.weekName].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {s.setCount} set{s.setCount === 1 ? "" : "s"} · {s.repCount} rep
                {s.repCount === 1 ? "" : "s"}
                {s.volume > 0 && ` · ${Math.round(s.volume).toLocaleString()} kg`}
              </p>
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card px-3 py-3.5">
      <p className="display-num text-[1.6rem] font-semibold leading-none text-zinc-100">{value}</p>
      <p className="section-label mt-1.5">{label}</p>
    </div>
  );
}
