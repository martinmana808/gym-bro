"use client";

import { numberOptions } from "@/lib/workout";

const selectField =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-zinc-100 " +
  "transition focus:border-lime-400 focus:outline-none";

/** A native <select> number picker. On iOS this renders as the wheel; elsewhere
 * a dropdown. Value is a string ("" = blank). */
export function NumberSelect({
  value,
  onChange,
  min,
  max,
  step,
  blank = false,
  blankLabel = "—",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  blank?: boolean;
  blankLabel?: string;
  className?: string;
}) {
  const options = numberOptions(min, max, step, { current: value });
  return (
    <select
      className={className ?? selectField}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {blank && <option value="">{blankLabel}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
