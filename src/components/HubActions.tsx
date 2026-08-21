"use client";

import { useState } from "react";
import { renameProgram, duplicateProgram } from "@/app/actions";

/**
 * The workout-level Edit, mirroring the day screen's: a button top-right that
 * opens renaming, with the other workout-wide actions alongside it rather than
 * loose on the page.
 */
export function HubActions({ programId, name }: { programId: string; name: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <form
        action={async (fd: FormData) => {
          await renameProgram(programId, String(fd.get("name") ?? ""));
          setOpen(false);
        }}
        className="flex items-center gap-2"
      >
        <input
          name="name"
          defaultValue={name}
          autoFocus
          aria-label="Workout name"
          className="w-40 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-lime-500 focus:outline-none"
        />
        <button className="text-sm font-medium text-lime-600">Save</button>
      </form>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <form action={duplicateProgram.bind(null, programId)}>
          <button className="transition hover:text-lime-600">Duplicate</button>
        </form>
        <button onClick={() => setOpen(false)} className="transition hover:text-zinc-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
