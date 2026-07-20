"use client";

import { useState } from "react";
import { renameVariation } from "@/app/actions";

export function VariationNameField({ variationId, name }: { variationId: string; name: string }) {
  const [value, setValue] = useState(name);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-zinc-400">Variation name</span>
      <input
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-zinc-100 transition focus:border-lime-400 focus:outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() && value !== name && renameVariation(variationId, value)}
        placeholder="Week 1"
      />
    </label>
  );
}
