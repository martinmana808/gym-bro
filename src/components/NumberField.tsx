"use client";

export function NumberField({
  label,
  value,
  onChange,
  step,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  decimal?: boolean;
}) {
  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, (Number(value) || 0) + dir * step);
    onChange(`${Math.round(next * 100) / 100}`);
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
      <p className="pt-3 text-center text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </p>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-1)}
          className="w-16 text-2xl font-medium text-zinc-500 transition hover:text-zinc-200 active:bg-zinc-800"
        >
          −
        </button>
        <input
          className="w-full min-w-0 bg-transparent pb-3 pt-1 text-center text-4xl font-bold tabular-nums text-zinc-50 focus:outline-none"
          type="number"
          inputMode={decimal ? "decimal" : "numeric"}
          step={decimal ? 0.5 : 1}
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(1)}
          className="w-16 text-2xl font-medium text-zinc-500 transition hover:text-zinc-200 active:bg-zinc-800"
        >
          +
        </button>
      </div>
    </div>
  );
}
