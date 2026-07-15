"use client";

import Link from "next/link";
import { useState } from "react";
import { createVariation, deleteVariation, renameVariation } from "@/app/actions";

export function VariationsBar({
  dayId,
  variations,
  activeId,
}: {
  dayId: string;
  variations: { id: string; name: string }[];
  activeId: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const active = variations.find((v) => v.id === activeId);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {variations.map((v) => (
          <Link
            key={v.id}
            href={`/workouts/${dayId}?v=${v.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              v.id === activeId
                ? "border-lime-400 bg-lime-400/10 font-medium text-lime-400"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {v.name}
          </Link>
        ))}
        <form action={createVariation.bind(null, dayId, activeId)}>
          <button
            className="rounded-full border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
            title="Duplicate the current variation"
          >
            + Variation
          </button>
        </form>
      </div>
      {active && (
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {renaming ? (
            <form
              action={async (fd: FormData) => {
                await renameVariation(active.id, String(fd.get("name") ?? ""));
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
              Rename
            </button>
          )}
          {variations.length > 1 && (
            <form
              action={deleteVariation.bind(null, active.id)}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Delete variation "${active.name}" and all its logged sessions? This cannot be undone.`,
                  )
                )
                  e.preventDefault();
              }}
            >
              <button className="transition hover:text-red-400">Delete</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
