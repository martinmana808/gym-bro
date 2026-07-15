// Parser for the user's workout spreadsheet (pasted TSV or uploaded CSV).
// Pure functions — no I/O — so every rule is unit-testable.

import type { RepScheme } from "@/db/schema";
import type { WeightUnit } from "@/lib/workout";

export type ProgramExercise = {
  name: string;
  sets: number;
  weightUnit: WeightUnit;
  repScheme: RepScheme;
  repsMin: number | null;
  repsMax: number | null;
  targetWeight: number | null;
  supersetGroup: string | null;
  sectionName: string | null;
  note: string | null;
};
export type ProgramDay = { name: string; exercises: ProgramExercise[] };
export type ProgramParseResult = { days: ProgramDay[]; warnings: string[] };

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Explicit workout CSV: "Day: <name>" / "Section: <muscle>" marker rows plus
 * exercise rows `name, sets, unit, scheme, reps, target_weight, superset_group, note`.
 */
export function parseWorkoutCsv(text: string): ProgramParseResult {
  const rows = splitRows(text);
  const days: ProgramDay[] = [];
  const warnings: string[] = [];
  let day: ProgramDay | null = null;
  let section: string | null = null;

  for (const [i, row] of rows.entries()) {
    const first = (row[0] ?? "").trim();
    if (!first) continue;
    const dayM = first.match(/^day\s*:\s*(.*)$/i);
    if (dayM) {
      day = { name: dayM[1].trim() || `Day ${days.length + 1}`, exercises: [] };
      days.push(day);
      section = null;
      continue;
    }
    const secM = first.match(/^section\s*:\s*(.*)$/i);
    if (secM) {
      section = secM[1].trim() || null;
      continue;
    }
    if (!day) {
      warnings.push(`Row ${i + 1}: "${first}" appears before any "Day:" line — skipped`);
      continue;
    }
    const [name, setsRaw, unitRaw, schemeRaw, repsRaw, targetRaw, groupRaw, noteRaw] = row.map(
      (c) => (c ?? "").trim(),
    );
    const weightUnit: WeightUnit = /brick/i.test(unitRaw) ? "bricks" : "kg";
    let repScheme: RepScheme = /fail/i.test(schemeRaw)
      ? "failure"
      : /range/i.test(schemeRaw)
        ? "range"
        : "fixed";
    let repsMin: number | null = null;
    let repsMax: number | null = null;
    if (repScheme === "range") {
      const m = repsRaw.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (m) {
        repsMin = parseInt(m[1], 10);
        repsMax = parseInt(m[2], 10);
      } else {
        warnings.push(`Row ${i + 1}: "${name}" is a range but reps "${repsRaw}" is not min-max — treated as fixed`);
        repScheme = "fixed";
        repsMin = clampInt(repsRaw, 1, 999, 10);
      }
    } else if (repScheme === "fixed") {
      repsMin = repsRaw ? clampInt(repsRaw, 1, 999, 10) : 10;
    }
    const targetWeight =
      targetRaw === "" || !Number.isFinite(Number(targetRaw)) ? null : Math.max(0, Number(targetRaw));
    day.exercises.push({
      name: name.slice(0, 120),
      sets: clampInt(setsRaw, 1, 20, 3),
      weightUnit,
      repScheme,
      repsMin,
      repsMax,
      targetWeight,
      supersetGroup: groupRaw || null,
      sectionName: section,
      note: noteRaw ? noteRaw.slice(0, 500) : null,
    });
  }
  if (!days.length) warnings.push('No "Day:" lines found — the file needs at least one day.');
  return { days, warnings };
}

function splitRows(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n");
  if (text.includes("\t")) return lines.map((l) => l.split("\t"));
  return lines.map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}
