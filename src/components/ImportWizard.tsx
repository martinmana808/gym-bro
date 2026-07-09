"use client";

import { useState, useTransition } from "react";
import { importSpreadsheet, type ImportDayPayload } from "@/app/actions";
import {
  parseRepList,
  parseSpreadsheet,
  type ImportedCell,
  type ParseResult,
} from "@/lib/import";

const cellId = (di: number, ei: number, ci: number) => `${di}#${ei}#${ci}`;

export function ImportWizard() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fixes, setFixes] = useState<Map<string, string>>(new Map());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const needsFix = (c: ImportedCell) => c.ambiguous || c.error !== null;

  const buildPayload = (): ImportDayPayload[] =>
    result!.days.map((day, di) => ({
      name: day.name,
      dates: day.dates.map((d) => d.toISOString()),
      exercises: day.exercises.map((e, ei) => ({
        name: e.name,
        sets: e.sets,
        weightUnit: e.weightUnit,
        repScheme: e.repScheme,
        repsMin: e.repsMin,
        note: e.note,
        blockStart: e.blockStart,
        cells: e.cells.map((c, ci) => {
          if (!c) return null;
          const fix = fixes.get(cellId(di, ei, ci));
          const sets = fix !== undefined ? parseRepList(fix, e.weight) : c.sets;
          return { sets, note: c.note };
        }),
      })),
    }));

  const unresolved = result
    ? result.days.flatMap((day, di) =>
        day.exercises.flatMap((e, ei) =>
          e.cells.flatMap((c, ci) =>
            c && needsFix(c) && !fixes.get(cellId(di, ei, ci))?.trim()
              ? [cellId(di, ei, ci)]
              : [],
          ),
        ),
      )
    : [];

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Copy your sheet in Google Sheets (Cmd+A, Cmd+C) and paste it below — or upload a CSV
          export. Nothing is imported until you confirm the preview.
        </p>
        <textarea
          className="h-56 w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Day 1\tSets\tWeight\t25.05\nChest press\t4\t72\t8888"}
        />
        <input
          type="file"
          accept=".csv,.tsv,.txt"
          className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-transparent file:px-3 file:py-1.5 file:text-zinc-300"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) file.text().then(setText);
          }}
        />
        <button
          disabled={!text.trim()}
          onClick={() => setResult(parseSpreadsheet(text))}
          className="rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
        >
          Preview import
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {result.warnings.map((w) => (
        <p key={w} className="text-sm text-amber-400">
          ⚠ {w}
        </p>
      ))}
      {result.days.map((day, di) => (
        <section key={di} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
          <h2 className="font-semibold tracking-tight">
            {day.name}{" "}
            <span className="text-sm font-normal text-zinc-500">
              · {day.dates.length} session{day.dates.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {day.exercises.map((e, ei) => (
              <div key={ei} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="text-xs text-zinc-500">
                    {e.sets} sets{e.weight != null && ` · ${e.weight}${e.weightUnit === "bricks" ? "br" : "kg"}`}
                    {e.repScheme === "failure" && " · to failure"}
                    {!e.blockStart && " · superset ↑"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.cells.map((c, ci) =>
                    c === null ? null : needsFix(c) ? (
                      <input
                        key={ci}
                        className="w-36 rounded-lg border border-amber-400/60 bg-zinc-900 px-2 py-1 text-xs text-amber-200 placeholder:text-amber-400/50 focus:border-amber-400 focus:outline-none"
                        placeholder={`${c.raw} → reps?`}
                        defaultValue={c.sets.map((s) => s.reps).join(",")}
                        onChange={(ev) =>
                          setFixes((m) => new Map(m).set(cellId(di, ei, ci), ev.target.value))
                        }
                      />
                    ) : (
                      <span
                        key={ci}
                        className="rounded-lg bg-zinc-800/70 px-2 py-1 text-xs tabular-nums text-zinc-300"
                      >
                        {c.sets.map((s) => s.reps).join("·")}
                        {c.note && " *"}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setResult(null);
            setFixes(new Map());
          }}
          className="flex-1 rounded-2xl border border-zinc-700 py-3.5 font-semibold text-zinc-300 transition hover:border-zinc-500"
        >
          Back
        </button>
        <button
          disabled={pending || unresolved.length > 0 || result.days.length === 0}
          onClick={() =>
            startTransition(async () => {
              try {
                await importSpreadsheet(buildPayload());
              } catch (e) {
                if (e && typeof e === "object" && "digest" in e) throw e;
                setError("Import failed — nothing may have been saved. Try again.");
              }
            })
          }
          className="flex-1 rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
        >
          {pending
            ? "Importing…"
            : unresolved.length > 0
              ? `Fix ${unresolved.length} cell${unresolved.length === 1 ? "" : "s"} first`
              : "Import"}
        </button>
      </div>
    </div>
  );
}
