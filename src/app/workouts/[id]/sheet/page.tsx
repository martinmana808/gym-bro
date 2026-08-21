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
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{sheet.program.name}</h1>
          <p className="text-sm text-zinc-500">Spreadsheet view · all weeks &amp; sessions</p>
        </div>
        <a
          href={`/workouts/${id}/sheet/export`}
          className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-lime-500 hover:text-lime-600"
        >
          ⬇ Export CSV
        </a>
      </header>

      {sheet.days.map((day) => (
        <section key={day.id} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {day.name}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-white">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-zinc-600"
                  >
                    Exercise
                  </th>
                  {day.weeks.map((w) => (
                    <th
                      key={w.position}
                      colSpan={1 + w.sessions.length}
                      className="border-l border-zinc-200 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-lime-600"
                    >
                      {w.name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-white text-zinc-500">
                  {day.weeks.map((w) => (
                    <Fragment key={w.position}>
                      <th className="border-l border-zinc-200 px-3 py-1.5 text-left font-medium">
                        Target
                      </th>
                      {w.sessions.map((s) => (
                        <th key={s.id} className="px-3 py-1.5 text-left font-normal">
                          <Link href={`/sessions/${s.id}`} className="hover:text-lime-600">
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
                            className="border-l-2 border-lime-500 bg-zinc-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-lime-600"
                          >
                            {row.sectionName}
                          </td>
                        </tr>
                      )}
                      {/* Supersets get a bracket down the exercise column —
                          a rule, not another label, so the grid stays readable. */}
                      <tr className={row.groupSize > 1 ? "" : "border-t border-zinc-200"}>
                        <td className="sticky left-0 z-10 bg-white/95 px-3 font-medium">
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
                            <td className="border-l border-zinc-200 px-3 py-2 tabular-nums text-zinc-500">
                              {c?.target ?? ""}
                            </td>
                            {day.weeks[wi].sessions.map((s, si) => (
                              <td key={s.id} className="px-3 py-2 tabular-nums text-zinc-600">
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
                    <td className="px-3 py-3 text-zinc-500">No exercises yet.</td>
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
