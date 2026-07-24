"use client";

import Link from "next/link";
import { useState } from "react";
import { addWeek, renameWeek, deleteWeek } from "@/app/actions";

/** Week selector for a workout. Links set `?week=<position>`; controls add (copy
 * current forward), rename (program-wide), and delete the selected week. */
export function WeekTabs({
  programId,
  weeks,
  selectedWeek,
  basePath,
}: {
  programId: string;
  weeks: { position: number; name: string }[];
  selectedWeek: number;
  /** Path the tabs link to, e.g. `/workouts/<id>` or `/workouts/<id>/days/<dayId>`. */
  basePath: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const active = weeks.find((w) => w.position === selectedWeek);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {weeks.map((w) => (
          <Link
            key={w.position}
            href={`${basePath}?week=${w.position}`}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              w.position === selectedWeek
                ? "border-lime-400 bg-lime-400/10 font-medium text-lime-400"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {w.name}
          </Link>
        ))}
        <form action={addWeek.bind(null, programId, selectedWeek)}>
          <button
            className="rounded-full border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
            title="Copy the current week forward"
          >
            + Week
          </button>
        </form>
      </div>
      {active && (
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {renaming ? (
            <form
              action={async (fd: FormData) => {
                await renameWeek(programId, selectedWeek, String(fd.get("name") ?? ""));
                setRenaming(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                name="name"
                defaultValue={active.name}
                autoFocus
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none"
              />
              <button className="text-lime-400">Save</button>
            </form>
          ) : (
            <button onClick={() => setRenaming(true)} className="transition hover:text-zinc-300">
              Rename week
            </button>
          )}
          {weeks.length > 1 && (
            <form
              action={deleteWeek.bind(null, programId, selectedWeek)}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Delete "${active.name}" for every day, including its logged sessions? This cannot be undone.`,
                  )
                )
                  e.preventDefault();
              }}
            >
              <button className="transition hover:text-red-400">Delete week</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
