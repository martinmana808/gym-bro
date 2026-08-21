"use client";

import Link from "next/link";
import { addDay, startSession } from "@/app/actions";
import type { HubDay } from "@/db/queries";

/** Hub list of days for the selected week. Each row: name, a muscle/exercise
 * summary, Start (this day, this week), and a link into the day. Plus rename /
 * delete controls and an "+ Add day" button. */
export function DaysList({
  programId,
  selectedWeek,
  days,
  lastDoneDayId,
}: {
  programId: string;
  selectedWeek: number;
  days: HubDay[];
  lastDoneDayId: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => (
        <DayRow
          key={d.id}
          programId={programId}
          selectedWeek={selectedWeek}
          day={d}
          isLastDone={d.id === lastDoneDayId}
        />
      ))}
      <form action={addDay.bind(null, programId)}>
        <button className="w-full rounded-2xl border border-dashed border-zinc-300 py-4 font-medium text-zinc-500 transition hover:border-lime-500 hover:text-lime-600">
          + Add day
        </button>
      </form>
    </div>
  );
}

function DayRow({
  programId,
  selectedWeek,
  day,
  isLastDone,
}: {
  programId: string;
  selectedWeek: number;
  day: HubDay;
  isLastDone: boolean;
}) {
  const dayHref = `/workouts/${programId}/days/${day.id}?week=${selectedWeek}`;
  const lastDone = day.lastDoneLabel;
  return (
    <div
      className={`rounded-2xl border p-4 ${
        isLastDone ? "border-lime-400/60 bg-lime-400/[0.04]" : "border-zinc-200 bg-white"
      }`}
    >
      <Link href={dayHref} className="block">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{day.name}</h3>
            {isLastDone && (
              <span className="rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-600">
                Last done
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">
            {day.exerciseCount} exercise{day.exerciseCount === 1 ? "" : "s"}
            {day.sectionSummary && ` · ${day.sectionSummary}`}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {lastDone ? `Last done ${lastDone}` : "Not done yet"}
          </p>
      </Link>
      <div className="mt-3 flex items-center gap-2">
        {day.unfinishedSessionId ? (
          <Link
            href={`/sessions/${day.unfinishedSessionId}`}
            className="flex-1 rounded-xl bg-amber-400 py-2 text-center font-bold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98]"
          >
            Resume
          </Link>
        ) : (
          <form action={startSession.bind(null, day.id, day.cellVariationId ?? undefined)} className="flex-1">
            <button
              disabled={!day.cellVariationId}
              className="w-full rounded-xl bg-lime-400 py-2 font-bold text-zinc-950 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-40"
            >
              Start
            </button>
          </form>
        )}
        <Link
          href={`/workouts/${programId}/days/${day.id}/edit?week=${selectedWeek}`}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition hover:border-zinc-400"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}
