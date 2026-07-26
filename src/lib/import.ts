// Parser for the "weeks as columns" workout CSV — mirrors how a training sheet
// is laid out: day blocks, optional "# Muscle" divider rows, and one target
// cell per week. Pure functions (no I/O) so every rule is unit-testable.

import type { RepScheme } from "@/db/schema";
import type { WeightUnit } from "@/lib/workout";

export type WeekTarget = {
  targetWeight: number | null;
  weightUnit: WeightUnit;
  repScheme: RepScheme;
  repsMin: number | null;
  repsMax: number | null;
};
export type WeeksExercise = {
  name: string;
  sets: number;
  sectionName: string | null;
  perWeek: WeekTarget[];
};
export type WeeksDay = { name: string; exercises: WeeksExercise[] };
export type WeeksParseResult = {
  programName: string | null;
  weekNames: string[];
  days: WeeksDay[];
  warnings: string[];
};

function clampInt(raw: string | number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function firstNumber(s: string): number | null {
  const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Parse a single week's target cell, e.g. "40kg x 8", "10bricks x 12",
 * "bodyweight x failure", "50 x 8-12", or "" (no target). */
export function parseTargetCell(raw: string): WeekTarget {
  const cell = (raw ?? "").trim();
  const out: WeekTarget = {
    targetWeight: null,
    weightUnit: "kg",
    repScheme: "fixed",
    repsMin: 10,
    repsMax: null,
  };
  if (!cell) return out;
  // Split "<weight> x <reps>" on the first standalone x (also accept ×).
  const parts = cell.split(/\s*[x×]\s*/i);
  const weightPart = (parts[0] ?? "").trim();
  const repsPart = (parts[1] ?? "").trim();

  if (/brick/i.test(weightPart) || /\bb\b/i.test(weightPart)) out.weightUnit = "bricks";
  if (/body\s*weight|bodyweight|^bw$/i.test(weightPart)) {
    out.targetWeight = null;
  } else {
    const w = firstNumber(weightPart);
    out.targetWeight = w == null ? null : Math.max(0, Math.min(999, w));
  }

  if (/fail|failure|^f$/i.test(repsPart)) {
    out.repScheme = "failure";
    out.repsMin = null;
    out.repsMax = null;
  } else {
    const range = repsPart.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) {
      out.repScheme = "range";
      out.repsMin = clampInt(range[1], 1, 999, 8);
      out.repsMax = clampInt(range[2], 1, 999, 12);
    } else {
      const r = firstNumber(repsPart);
      out.repScheme = "fixed";
      out.repsMin = r == null ? 10 : clampInt(r, 1, 999, 10);
      out.repsMax = null;
    }
  }
  return out;
}

/**
 * Parse a weeks-as-columns program CSV:
 *   Program,<name>
 *   Day 1,Sets,Week 1,Week 2,Week 3
 *   # Chest
 *   Bench press,4,40kg x 8,42.5kg x 8,45kg x 6
 *   ...
 */
export function parseWeeksCsv(text: string): WeeksParseResult {
  const rows = splitRows(text);
  const days: WeeksDay[] = [];
  const warnings: string[] = [];
  let programName: string | null = null;
  let weekNames: string[] = [];
  let day: WeeksDay | null = null;
  let section: string | null = null;

  for (const [i, row] of rows.entries()) {
    const first = (row[0] ?? "").trim();
    const second = (row[1] ?? "").trim();
    if (!first && !row.some((c) => (c ?? "").trim())) continue; // blank separator

    if (/^program$/i.test(first)) {
      programName = second || null;
      continue;
    }
    if (first.startsWith("#")) {
      section = first.replace(/^#+\s*/, "").trim() || null;
      continue;
    }
    // Day header: "<name>, Sets, <week names...>"
    if (/^sets$/i.test(second)) {
      const names = row
        .slice(2)
        .map((c) => (c ?? "").trim())
        .filter((c) => c.length > 0);
      if (names.length > weekNames.length) weekNames = names;
      day = { name: first || `Day ${days.length + 1}`, exercises: [] };
      days.push(day);
      section = null;
      continue;
    }
    if (!first) continue;
    if (!day) {
      warnings.push(`Row ${i + 1}: "${first}" is before any day header — skipped`);
      continue;
    }
    // Exercise row: name, sets, <target per week...>
    const name = first.slice(0, 120);
    const sets = clampInt(second, 1, 20, 3);
    const perWeek = row.slice(2).map((c) => parseTargetCell(c ?? ""));
    day.exercises.push({ name, sets, sectionName: section, perWeek });
  }

  if (!weekNames.length) weekNames = ["Week 1"];
  // Pad/truncate each exercise's perWeek to the program's week count.
  for (const d of days)
    for (const e of d.exercises) {
      while (e.perWeek.length < weekNames.length) e.perWeek.push(parseTargetCell(""));
      e.perWeek = e.perWeek.slice(0, weekNames.length);
    }
  if (!days.length) warnings.push('No day header found — a day row looks like "Day 1,Sets,Week 1,Week 2".');
  return { programName, weekNames, days, warnings };
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
