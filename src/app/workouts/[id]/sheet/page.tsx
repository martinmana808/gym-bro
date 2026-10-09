import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getProgramSheet } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const sheet = await getProgramSheet(id, userId);
  if (!sheet) notFound();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-12 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${id}`}
          aria-label="Back to workout"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/60 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{sheet.program.name}</h1>
          <p className="text-sm text-zinc-400">Spreadsheet view · all weeks &amp; sessions</p>
        </div>
        <a
          href={`/workouts/${id}/sheet/export`}
          className="shrink-0 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ⬇ Export CSV
        </a>
      </header>

      {sheet.days.map((day) => (
        <section key={day.id} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">
            {day.name}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-900/60">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-10 bg-zinc-900/60 px-3 py-2 text-left font-medium text-zinc-300"
                  >
                    Exercise
                  </th>
                  {day.weeks.map((w) => (
                    <th
                      key={w.position}
                      colSpan={1 + w.sessions.length}
                      className="border-l border-zinc-800 px-3 py-1.5 text-center section-label"
                    >
                      {w.name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-zinc-900/60 text-zinc-400">
                  {day.weeks.map((w) => (
                    <Fragment key={w.position}>
                      <th className="border-l border-zinc-800 px-3 py-1.5 text-left font-medium">
                        Target
                      </th>
                      {w.sessions.map((s) => (
                        <th key={s.id} className="px-3 py-1.5 text-left font-normal">
                          <Link href={`/sessions/${s.id}`} className="hover:text-lime-400">
                            {s.label}
                          </Link>
                        </th>
                      ))}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, ri) => {
                  const prevSection = ri > 0 ? day.rows[ri - 1].sectionName : null;
                  const showSection = row.sectionName && row.sectionName !== prevSection;
                  const totalCols = 1 + day.weeks.reduce((n, w) => n + 1 + w.sessions.length, 0);
                  return (
                    <Fragment key={row.key + ri}>
                      {showSection && (
                        <tr>
                          <td
                            colSpan={totalCols}
                            className="border-l-2 border-lime-400 bg-zinc-950 px-3 py-1 section-label"
                          >
                            {row.sectionName}
                          </td>
                        </tr>
                      )}
                      {/* Supersets get a bracket down the exercise column —
                          a rule, not another label, so the grid stays readable. */}
                      <tr className={row.groupSize > 1 ? "" : "border-t border-zinc-800"}>
                        <td className="sticky left-0 z-10 bg-zinc-950/95 px-3 font-medium">
                          {/* The rule is absolute so it fills the row edge to
                              edge — adjacent rows then join into one bracket. */}
                          <span className="relative block py-2 pl-3">
                            {row.groupSize > 1 && (
                              <span
                                aria-hidden
                                className={`absolute inset-y-0 left-0 w-0.5 bg-lime-500 ${
                                  row.groupPos === 1 ? "rounded-t-full" : ""
                                } ${row.groupPos === row.groupSize ? "rounded-b-full" : ""}`}
                              />
                            )}
                            {row.name}
                          </span>
                        </td>
                        {row.byWeek.map((c, wi) => (
                          <Fragment key={wi}>
                            <td className="border-l border-zinc-800 px-3 py-2 metric text-zinc-400">
                              {c?.target ?? ""}
                            </td>
                            {day.weeks[wi].sessions.map((s, si) => (
                              <td key={s.id} className="px-3 py-2 metric text-zinc-300">
                                {c?.sessions[si] ?? ""}
                              </td>
                            ))}
                          </Fragment>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
                {day.rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-zinc-400">No exercises yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
