"use client";

import { useState, useTransition } from "react";
import { importWeeksProgram, type ImportWeeksDay } from "@/app/actions";
import { parseWeeksCsv, type WeeksParseResult, type WeekTarget } from "@/lib/import";

function targetLabel(t: WeekTarget): string {
  const w =
    t.targetWeight == null
      ? "body"
      : `${t.targetWeight}${t.weightUnit === "bricks" ? "br" : "kg"}`;
  const reps =
    t.repScheme === "failure"
      ? "F"
      : t.repScheme === "range"
        ? `${t.repsMin}-${t.repsMax}`
        : `${t.repsMin}`;
  return `${w}×${reps}`;
}

export function ImportWizard() {
  const [programName, setProgramName] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<WeeksParseResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const buildDays = (): ImportWeeksDay[] =>
    result!.days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        sectionName: e.sectionName,
        perWeek: e.perWeek,
      })),
    }));

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Paste your workout below (or upload a CSV) — days down the page, weeks across as columns.
          Nothing is imported until you confirm the preview.
        </p>
        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Workout name (optional — taken from a “Program,” line otherwise)
          <input
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
            placeholder="My Split"
          />
        </label>
        <textarea
          className="h-56 w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Program,My Split\nDay 1,Sets,Week 1,Week 2,Week 3\n# Chest\nBench press,4,40kg x 8,42.5kg x 8,45kg x 6"
          }
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
          href="/workout-example.csv"
          download
          className="text-center text-sm text-lime-400 underline underline-offset-2 hover:text-lime-300"
        >
          Download workout-example.csv
        </a>
        <button
          disabled={!text.trim()}
          onClick={() => setResult(parseWeeksCsv(text))}
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
      <p className="text-xs text-zinc-500">
        {result.days.length} day{result.days.length === 1 ? "" : "s"} · {result.weekNames.length} week
        {result.weekNames.length === 1 ? "" : "s"} ({result.weekNames.join(", ")})
      </p>
      {result.days.map((day, di) => (
        <section key={di} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
          <h2 className="font-semibold tracking-tight">{day.name}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {day.exercises.map((e, ei) => (
              <div key={ei} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="text-xs text-zinc-500">{e.sets} sets</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.sectionName && (
                    <span className="rounded-lg bg-lime-400/10 px-2 py-1 text-xs text-lime-300">
                      {e.sectionName}
                    </span>
                  )}
                  {e.perWeek.map((t, wi) => (
                    <span
                      key={wi}
                      className="rounded-lg bg-zinc-800/70 px-2 py-1 text-xs tabular-nums text-zinc-300"
                      title={result.weekNames[wi]}
                    >
                      W{wi + 1}: {targetLabel(t)}
                    </span>
                  ))}
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
                await importWeeksProgram(
                  programName.trim() || result.programName || "Imported program",
                  result.weekNames,
                  buildDays(),
                );
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
