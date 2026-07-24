"use client";

import Link from "next/link";
import { useState } from "react";
import { addDay, renameDay, deleteDay, startSession } from "@/app/actions";
import type { HubDay } from "@/db/queries";

/** Hub list of days for the selected week. Each row: name, a muscle/exercise
 * summary, Start (this day, this week), and a link into the day. Plus rename /
 * delete controls and an "+ Add day" button. */
export function DaysList({
  programId,
  selectedWeek,
  days,
}: {
  programId: string;
  selectedWeek: number;
  days: HubDay[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => (
        <DayRow key={d.id} programId={programId} selectedWeek={selectedWeek} day={d} />
      ))}
      <form action={addDay.bind(null, programId)}>
        <button className="w-full rounded-2xl border border-dashed border-zinc-700 py-4 font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400">
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
}: {
  programId: string;
  selectedWeek: number;
  day: HubDay;
}) {
  const [renaming, setRenaming] = useState(false);
  const dayHref = `/workouts/${programId}/days/${day.id}?week=${selectedWeek}`;
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
      {renaming ? (
        <form
          action={async (fd: FormData) => {
            await renameDay(day.id, String(fd.get("name") ?? ""));
            setRenaming(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="name"
            defaultValue={day.name}
            autoFocus
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-lime-400 focus:outline-none"
          />
          <button className="text-sm text-lime-400">Save</button>
        </form>
      ) : (
        <Link href={dayHref} className="block">
          <h3 className="text-lg font-semibold tracking-tight">{day.name}</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {day.exerciseCount} exercise{day.exerciseCount === 1 ? "" : "s"}
            {day.sectionSummary && ` · ${day.sectionSummary}`}
          </p>
        </Link>
      )}
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
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
        >
          Edit
        </Link>
        <button
          onClick={() => setRenaming((r) => !r)}
          className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-500 transition hover:text-zinc-300"
          type="button"
        >
          ✎
        </button>
        <form
          action={deleteDay.bind(null, day.id)}
          onSubmit={(e) => {
            if (!confirm(`Delete "${day.name}" and all its weeks and logged sessions? This cannot be undone.`))
              e.preventDefault();
          }}
        >
          <button className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-600 transition hover:text-red-400">
            🗑
          </button>
        </form>
      </div>
    </div>
  );
}
