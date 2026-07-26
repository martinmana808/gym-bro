"use client";

import { useState } from "react";
import { renameProgram, duplicateProgram } from "@/app/actions";

export function HubActions({ programId, name }: { programId: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {renaming ? (
        <form
          action={async (fd: FormData) => {
            await renameProgram(programId, String(fd.get("name") ?? ""));
            setRenaming(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="name"
            defaultValue={name}
            autoFocus
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 focus:border-lime-400 focus:outline-none"
          />
          <button className="text-lime-400">Save</button>
        </form>
      ) : (
        <button
          onClick={() => setRenaming(true)}
          className="text-zinc-400 transition hover:text-zinc-200"
        >
          Rename workout
        </button>
      )}
      <form action={duplicateProgram.bind(null, programId)}>
        <button className="text-zinc-400 transition hover:text-lime-400">Duplicate workout</button>
      </form>
    </div>
  );
}
