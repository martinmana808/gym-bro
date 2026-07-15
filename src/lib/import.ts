// Parser for the user's workout spreadsheet (pasted TSV or uploaded CSV).
// Pure functions — no I/O — so every rule is unit-testable.

import type { RepScheme } from "@/db/schema";
import type { WeightUnit } from "@/lib/workout";

export type ImportedSet = { setNumber: number; weight: number | null; reps: number | null };
export type ImportedCell = {
  raw: string;
  sets: ImportedSet[];
  note: string | null;
  ambiguous: boolean;
  error: string | null;
};
export type ImportedExercise = {
  name: string;
  sets: number;
  weight: number | null;
  weightUnit: WeightUnit;
  repScheme: RepScheme;
  repsMin: number | null;
  note: string | null;
  blockStart: boolean;
  cells: (ImportedCell | null)[];
};
export type ImportedDay = { name: string; dates: Date[]; exercises: ImportedExercise[] };
export type ParseResult = { days: ImportedDay[]; warnings: string[] };

export function parseSpreadsheet(text: string, today: Date = new Date()): ParseResult {
  const rows = splitRows(text);
  const days: ImportedDay[] = [];
  const warnings: string[] = [];
  let day: ImportedDay | null = null;
  let setsCol = -1;
  let prev: ImportedExercise | null = null;
  let dateCols: number[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const si = row.findIndex((c) => /^sets$/i.test(c.trim()));
    if (si > 0) {
      // Header row starts a new day: "Day 1 | Sets | Weight | 25.05 | ..."
      // Track the ORIGINAL column offset for each kept date so a blank/non-date
      // column between two dates doesn't shift later cell reads out of alignment.
      const dates: Date[] = [];
      const cols: number[] = [];
      for (let c = si + 2; c < row.length; c++) {
        const d = parseDate(row[c], today);
        if (d) {
          dates.push(d);
          cols.push(c);
        }
      }
      day = { name: row[0].trim() || `Day ${days.length + 1}`, dates, exercises: [] };
      days.push(day);
      setsCol = si;
      dateCols = cols;
      prev = null;
      continue;
    }
    if (!day) continue;
    const name = (row[0] ?? "").trim();
    if (!name) {
      prev = null; // blank separator row ends any block
      continue;
    }
    const setsCell = (row[setsCol] ?? "").trim();
    const blockStart = setsCell !== "";
    const sets = blockStart ? parseInt(setsCell, 10) : (prev?.sets ?? 0);
    if (!sets || Number.isNaN(sets)) {
      warnings.push(`Row ${rowIndex + 1}: "${name}" has no set count — skipped`);
      continue;
    }
    const w = parseWeightCell(row[setsCol + 1] ?? "");
    const exercise: ImportedExercise = {
      name,
      sets,
      weight: w.weight,
      weightUnit: w.weightUnit,
      repScheme: w.repScheme,
      repsMin: w.repsMin,
      note: w.note,
      blockStart: blockStart || !prev,
      cells: dateCols.map((col) => {
        const raw = row[col] ?? "";
        return raw.trim() ? parseSessionCell(raw, sets, w.weight) : null;
      }),
    };
    day.exercises.push(exercise);
    prev = exercise;
  }
  if (!days.length) warnings.push("No day header found (need a row with a 'Sets' column).");
  return { days, warnings };
}

/** "72" | "36.25(.pulley)" | "25 FAIL" | "12 reps min" | "Bodyweight" | "90 (+ barbell)" */
export function parseWeightCell(raw: string): {
  weight: number | null;
  weightUnit: WeightUnit;
  repScheme: RepScheme;
  repsMin: number | null;
  note: string | null;
} {
  const cleaned = raw.trim();
  const weightUnit: WeightUnit = /plate|pulley|brick/i.test(cleaned) ? "bricks" : "kg";
  const repScheme: RepScheme = /fail/i.test(cleaned) ? "failure" : "fixed";
  const repsMinMatch = cleaned.match(/(\d+)\s*reps?\s*min/i);
  if (repsMinMatch) {
    return { weight: null, weightUnit, repScheme, repsMin: parseInt(repsMinMatch[1], 10), note: null };
  }
  const numMatch = cleaned.match(/\d+(?:[.,]\d+)?/);
  const weight = numMatch ? parseFloat(numMatch[0].replace(",", ".")) : null;
  let note = cleaned;
  if (numMatch) note = note.replace(numMatch[0], "");
  note = note.replace(/fail/i, "").replace(/[()]/g, "").trim();
  return { weight, weightUnit, repScheme, repsMin: null, note: note || null };
}

/**
 * One session cell: digit runs are rep sequences segmented to `sets` values;
 * "(68)" switches the working weight; paren text becomes a note.
 */
export function parseSessionCell(
  raw: string,
  sets: number,
  baseWeight: number | null,
): ImportedCell {
  const trimmed = raw.trim();
  if (!trimmed) return { raw, sets: [], note: null, ambiguous: false, error: null };

  const noteParts: string[] = [];
  const runs: { text: string; weight: number | null }[] = [];
  let weight = baseWeight;
  for (const ev of tokenizeCell(trimmed)) {
    if (ev.kind === "digits") {
      runs.push({ text: ev.text, weight });
      continue;
    }
    const num = ev.content.match(/\d+(?:[.,]\d+)?/);
    if (num) weight = parseFloat(num[0].replace(",", "."));
    const text = ev.content.replace(num?.[0] ?? "", "").replace(/^[.\s]+|[.\s]+$/g, "");
    if (text) noteParts.push(text);
  }
  const note = noteParts.join("; ") || null;
  if (!runs.length) return { raw, sets: [], note, ambiguous: false, error: "no reps found" };

  // Cheap bound BEFORE combinatorial enumeration: any valid segmentation of the
  // digit runs into exactly `sets` values of 1-2 digits each requires the total
  // digit count D to satisfy sets <= D <= 2*sets. This keeps the enumeration
  // below provably bounded (D <= 2*sets <= 40 since sets <= 20) and prevents an
  // OOM crash on long contiguous digit runs from pasted-corruption input.
  const totalDigits = runs.reduce((sum, r) => sum + r.text.length, 0);
  if (totalDigits < sets || totalDigits > 2 * sets) {
    return {
      raw,
      sets: [],
      note,
      ambiguous: false,
      error: `cannot split ${totalDigits} digits into ${sets} sets`,
    };
  }

  // Every way to read the digit runs as exactly `sets` rep values (1–2 digits each).
  let combos: { reps: number[]; weights: (number | null)[] }[] = [{ reps: [], weights: [] }];
  for (const run of runs) {
    const next: typeof combos = [];
    for (const c of combos) {
      for (const opt of tokenizations(run.text)) {
        if (c.reps.length + opt.length > sets) continue;
        next.push({
          reps: [...c.reps, ...opt],
          weights: [...c.weights, ...opt.map(() => run.weight)],
        });
      }
      if (next.length > 5000) {
        return { raw, sets: [], note, ambiguous: false, error: "too many possible readings" };
      }
    }
    combos = next;
  }
  const complete = combos.filter((c) => c.reps.length === sets);
  const plausible = complete.filter((c) => c.reps.every((r) => r >= 1 && r <= 30));
  const readings = plausible.length ? plausible : complete;
  if (!readings.length) {
    return { raw, sets: [], note, ambiguous: false, error: `cannot split "${trimmed}" into ${sets} sets` };
  }
  const chosen = readings[0];
  return {
    raw,
    sets: chosen.reps.map((reps, i) => ({ setNumber: i + 1, weight: chosen.weights[i], reps })),
    note,
    ambiguous: readings.length > 1,
    error: null,
  };
}

/** Manual correction input: "18,17,17,7,15" (any non-digit separator). */
export function parseRepList(input: string, weight: number | null): ImportedSet[] {
  return input
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((t, i) => ({ setNumber: i + 1, weight, reps: parseInt(t, 10) }));
}

type CellEvent = { kind: "digits"; text: string } | { kind: "paren"; content: string };

function tokenizeCell(raw: string): CellEvent[] {
  const events: CellEvent[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "(") {
      const close = raw.indexOf(")", i);
      events.push({ kind: "paren", content: close === -1 ? raw.slice(i + 1) : raw.slice(i + 1, close) });
      i = close === -1 ? raw.length : close + 1;
    } else if (/\d/.test(ch)) {
      let j = i;
      while (j < raw.length && /\d/.test(raw[j])) j++;
      events.push({ kind: "digits", text: raw.slice(i, j) });
      i = j;
    } else {
      i++; // separators: dots, commas, spaces, slashes
    }
  }
  return events;
}

/** All splits of a digit string into 1–2 digit tokens (no zero / leading-zero reps). */
function tokenizations(digits: string): number[][] {
  if (digits === "") return [[]];
  const out: number[][] = [];
  for (const len of [1, 2]) {
    if (digits.length < len) continue;
    const head = digits.slice(0, len);
    if (head.startsWith("0")) continue;
    for (const rest of tokenizations(digits.slice(len))) out.push([parseInt(head, 10), ...rest]);
  }
  return out;
}

/** "25.05" | "25/05" → a Date at 12:00; future dates roll back one year. */
function parseDate(cell: string, today: Date): Date | null {
  const m = cell.trim().match(/^(\d{1,2})[./](\d{1,2})\.?$/);
  if (!m) return null;
  const dayNum = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (dayNum < 1 || dayNum > 31 || month < 1 || month > 12) return null;
  const date = new Date(today.getFullYear(), month - 1, dayNum, 12);
  if (date.getMonth() !== month - 1 || date.getDate() !== dayNum) return null;
  if (date.getTime() > today.getTime()) date.setFullYear(date.getFullYear() - 1);
  return date;
}

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
