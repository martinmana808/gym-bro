"use client";

import { useState } from "react";
import { numberOptions } from "@/lib/workout";
import { WheelPicker } from "@/components/WheelPicker";

const selectField =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-left text-zinc-100 " +
  "transition focus:border-lime-400 focus:outline-none";

/**
 * A number field that opens an iOS-style wheel picker. (A native <select> is no
 * longer the wheel on modern iOS — it renders as a flat menu — so the drum is
 * our own component.) Value is a string; "" is the blank option.
 */
export function NumberSelect({
  value,
  onChange,
  min,
  max,
  step,
  blank = false,
  blankLabel = "—",
  className,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  blank?: boolean;
  blankLabel?: string;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const options = [...(blank ? [""] : []), ...numberOptions(min, max, step, { current: value })];
  const labels = blank ? { "": blankLabel } : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${className ?? selectField} flex items-center justify-between gap-2`}
      >
        <span className="tabular-nums">{value === "" ? blankLabel : value}</span>
        <span aria-hidden className="text-xs text-zinc-500">
          ⌄
        </span>
      </button>
      {open && (
        <WheelPicker
          options={options}
          labels={labels}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          title={title}
        />
      )}
    </>
  );
}
