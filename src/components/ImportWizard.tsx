"use client";

import { useState, useTransition } from "react";
import { importProgram, type ImportProgramDay } from "@/app/actions";
import { parseWorkoutCsv, type ProgramParseResult } from "@/lib/import";

export function ImportWizard() {
  const [programName, setProgramName] = useState("Imported program");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ProgramParseResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): ImportProgramDay[] =>
    result!.days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        weightUnit: e.weightUnit,
        repScheme: e.repScheme,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        targetWeight: e.targetWeight,
        supersetGroup: e.supersetGroup,
        sectionName: e.sectionName,
        note: e.note,
      })),
    }));

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Paste a CSV describing your program below — or upload a CSV export. Nothing is imported
          until you confirm the preview.
        </p>
        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Program name
          <input
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
            placeholder="Imported program"
          />
        </label>
        <textarea
          className="h-56 w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Day: Push\nSection: Chest\nBench press,4,kg,fixed,8,60,,"}
        />
        <input
          type="file"
          accept=".csv,.txt"
          className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-transparent file:px-3 file:py-1.5 file:text-zinc-300"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) file.text().then(setText);
          }}
        />
        <a
          href="/example.csv"
          download
          className="text-center text-sm text-lime-400 underline underline-offset-2 hover:text-lime-300"
        >
          Download example.csv
        </a>
        <button
          disabled={!text.trim()}
          onClick={() => setResult(parseWorkoutCsv(text))}
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
          <h2 className="font-semibold tracking-tight">{day.name}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {day.exercises.map((e, ei) => (
              <div key={ei} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="text-xs text-zinc-500">
                    {e.sets} sets · {e.weightUnit === "bricks" ? "bricks" : "kg"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.sectionName && (
                    <span className="rounded-lg bg-zinc-800/70 px-2 py-1 text-xs text-zinc-300">
                      {e.sectionName}
                    </span>
                  )}
                  <span className="rounded-lg bg-zinc-800/70 px-2 py-1 text-xs text-zinc-300">
                    {e.repScheme === "failure"
                      ? "to failure"
                      : e.repScheme === "range"
                        ? `${e.repsMin}-${e.repsMax} reps`
                        : `${e.repsMin} reps`}
                  </span>
                  {e.targetWeight != null && (
                    <span className="rounded-lg bg-zinc-800/70 px-2 py-1 text-xs tabular-nums text-zinc-300">
                      {e.targetWeight}
                      {e.weightUnit === "bricks" ? "br" : "kg"}
                    </span>
                  )}
                  {e.supersetGroup && (
                    <span className="rounded-lg bg-amber-400/10 px-2 py-1 text-xs text-amber-300">
                      superset {e.supersetGroup}
                    </span>
                  )}
                  {e.note && (
                    <span className="rounded-lg bg-zinc-800/70 px-2 py-1 text-xs text-zinc-400">
                      {e.note}
                    </span>
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
          onClick={() => setResult(null)}
          className="flex-1 rounded-2xl border border-zinc-700 py-3.5 font-semibold text-zinc-300 transition hover:border-zinc-500"
        >
          Back
        </button>
        <button
          disabled={pending || result.days.length === 0}
          onClick={() =>
            startTransition(async () => {
              try {
                await importProgram(programName, buildPayload());
              } catch (e) {
                if (e && typeof e === "object" && "digest" in e) throw e;
                setError("Import failed — nothing may have been saved. Try again.");
              }
            })
          }
          className="flex-1 rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}
