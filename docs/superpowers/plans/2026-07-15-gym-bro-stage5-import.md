# Gym Bro Stage 5: Import Redesign + example.csv Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Replace the guess-heavy dense-sheet importer with a clean, explicit CSV format the user fills in, and give them a downloadable `example.csv`. Import bootstraps a program's structure (days → muscle sections → supersets → exercises + target weights, one "Base" variation) — no session history (logging happens in-app going forward).

**Architecture:** A new pure parser `parseWorkoutCsv` reads an explicit format with `Day:`/`Section:` marker rows and fixed exercise columns. A new `importProgram` server action writes program/days/Base-variation/exercises (with `sectionName`, `supersetKey` from the `superset_group` column, `targetWeight`, rep scheme). The `ImportWizard` is rewritten for the new format with a preview and a program-name field; `public/example.csv` is the downloadable template. The old dense parser, its `importSpreadsheet` action payload, and their tests are retired.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-gym-bro-programs-variations-design.md` (Stage 5).

## Global Constraints

- **Canonical format:** `Day: <name>` row starts a day; `Section: <muscle>` row starts a section (label only). Exercise rows are 8 columns: `name, sets, unit(kg|bricks), scheme(fixed|range|failure), reps, target_weight, superset_group, note`.
  - `reps`: fixed → a number; range → `min-max` (e.g. `8-12`); failure → blank.
  - `target_weight`: a number, or blank = bodyweight/none.
  - `superset_group`: same non-blank label on **consecutive** rows = one superset; blank = standalone.
  - `note`: optional.
- Import creates **structure only** (program + days + one "Base" variation + exercises). No sessions, no set logs.
- Ownership: `importProgram` calls `requireUserId()`; everything is stamped to that user; the whole write is one transaction.
- The old dense-sheet parser (`parseSpreadsheet`, `parseSessionCell`, `parseWeightCell`, `parseRepList`), the old `importSpreadsheet` action + its `ImportDayPayload` types, and their tests are removed once the new path works.
- Verification: `npm test`, `npx tsc --noEmit`, `npm run lint` pass before every commit; commit every task. Dev server controller-owned (port 3000).

## File structure

- `src/lib/import.ts` — new `parseWorkoutCsv` + `ProgramDay`/`ProgramExercise` types (Task 1, alongside old); old dense functions removed in Task 2. Keep the `splitRows`/`parseCsvLine` helpers.
- `src/lib/import.test.ts` — new parser tests (Task 1); old dense tests removed in Task 2.
- `src/app/actions.ts` — new `importProgram` action + payload types; old `importSpreadsheet` + `ImportDayPayload*` removed (Task 2).
- `src/components/ImportWizard.tsx` — rewritten for the new format (Task 2).
- `public/example.csv` — downloadable template (Task 2).
- `src/app/import/page.tsx` — unchanged (renders `ImportWizard`).

---

### Task 1: New parser `parseWorkoutCsv` (TDD, added alongside old)

**Files:** `src/lib/import.ts`, `src/lib/import.test.ts`

**Interfaces (Produces):**
```ts
export type ProgramExercise = {
  name: string; sets: number; weightUnit: WeightUnit;
  repScheme: RepScheme; repsMin: number | null; repsMax: number | null;
  targetWeight: number | null; supersetGroup: string | null;
  sectionName: string | null; note: string | null;
};
export type ProgramDay = { name: string; exercises: ProgramExercise[] };
export type ProgramParseResult = { days: ProgramDay[]; warnings: string[] };
export function parseWorkoutCsv(text: string): ProgramParseResult;
```

- [ ] **Step 1: Tests first** — append to `src/lib/import.test.ts`:

```ts
import { parseWorkoutCsv } from "./import";

describe("parseWorkoutCsv", () => {
  const CSV = [
    "Day: Push",
    "Section: Chest",
    "Bench press,4,kg,fixed,8,60,,",
    "Incline dumbbell,4,kg,range,8-12,22.5,,",
    "Section: Triceps",
    "Pushdown,3,bricks,fixed,12,20,supA,",
    "Overhead ext,3,kg,fixed,12,15,supA,felt strong",
    "Day: Pull",
    "Section: Back",
    "Pull-up,3,bricks,failure,,,,",
  ].join("\n");

  it("parses days, sections, schemes, units, targets, supersets, notes", () => {
    const { days, warnings } = parseWorkoutCsv(CSV);
    expect(warnings).toEqual([]);
    expect(days.map((d) => d.name)).toEqual(["Push", "Pull"]);
    const push = days[0].exercises;
    expect(push).toHaveLength(4);
    expect(push[0]).toMatchObject({
      name: "Bench press", sets: 4, weightUnit: "kg", repScheme: "fixed",
      repsMin: 8, repsMax: null, targetWeight: 60, sectionName: "Chest",
      supersetGroup: null, note: null,
    });
    expect(push[1]).toMatchObject({ repScheme: "range", repsMin: 8, repsMax: 12, targetWeight: 22.5 });
    expect(push[2]).toMatchObject({ weightUnit: "bricks", sectionName: "Triceps", supersetGroup: "supA" });
    expect(push[3]).toMatchObject({ supersetGroup: "supA", note: "felt strong" });
    const pull = days[1].exercises;
    expect(pull[0]).toMatchObject({
      repScheme: "failure", repsMin: null, repsMax: null, targetWeight: null,
      weightUnit: "bricks", sectionName: "Back",
    });
  });

  it("warns on an exercise row before any Day and on an empty file", () => {
    expect(parseWorkoutCsv("Bench,4,kg,fixed,8,60,,").warnings.length).toBeGreaterThan(0);
    expect(parseWorkoutCsv("").warnings.length).toBeGreaterThan(0);
  });

  it("falls back to fixed when a range cell has no min-max", () => {
    const { days } = parseWorkoutCsv("Day: D\nBench,3,kg,range,10,50,,");
    expect(days[0].exercises[0]).toMatchObject({ repScheme: "fixed", repsMin: 10 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test`): `parseWorkoutCsv` not exported.

- [ ] **Step 3: Implement** — add to `src/lib/import.ts` (do NOT remove old functions yet; reuse the existing `splitRows`/`parseCsvLine` helpers at the bottom of the file):

```ts
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
```

- [ ] **Step 4: Verify + commit** — `npm test && npx tsc --noEmit && npm run lint` (new tests pass; old dense tests still pass since old code remains).
Commit: `git add src/lib/import.ts src/lib/import.test.ts && git commit -m "feat: parseWorkoutCsv explicit-format parser"`

---

### Task 2: New import action + wizard + example.csv (atomic; retires old importer)

**Files:** `src/app/actions.ts`, `src/components/ImportWizard.tsx`, `public/example.csv`, `src/lib/import.ts`, `src/lib/import.test.ts`

**Interfaces (Produces):**
- `importProgram(programName: string, days: ImportProgramDay[]): Promise<void>` where `ImportProgramDay = { name: string; exercises: ImportProgramExercise[] }` and `ImportProgramExercise` mirrors `ProgramExercise`.

- [ ] **Step 1: `importProgram` action**

In `src/app/actions.ts`, add (and REMOVE the old `importSpreadsheet` + `ImportSetPayload`/`ImportCellPayload`/`ImportExercisePayload`/`ImportDayPayload` types):

```ts
export type ImportProgramExercise = {
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
export type ImportProgramDay = { name: string; exercises: ImportProgramExercise[] };

export async function importProgram(programName: string, days: ImportProgramDay[]) {
  const userId = await requireUserId();
  const db = await getDb();
  let firstDayId = "";
  await db.transaction(async (tx) => {
    const [program] = await tx
      .insert(schema.programs)
      .values({ userId, name: programName.trim().slice(0, 80) || "Imported program" })
      .returning({ id: schema.programs.id });
    for (const [di, d] of days.entries()) {
      const [day] = await tx
        .insert(schema.days)
        .values({ programId: program.id, position: di, name: d.name.trim().slice(0, 80) || `Day ${di + 1}`, defaultRestSeconds: 90 })
        .returning({ id: schema.days.id });
      if (di === 0) firstDayId = day.id;
      const [variation] = await tx
        .insert(schema.variations)
        .values({ dayId: day.id, position: 0, name: "Base" })
        .returning({ id: schema.variations.id });
      let prevGroup: string | null = null;
      let key = crypto.randomUUID();
      const rows = d.exercises
        .filter((e) => e.name.trim())
        .map((e, i) => {
          const sameBlock = i > 0 && e.supersetGroup != null && e.supersetGroup === prevGroup;
          if (!sameBlock) key = crypto.randomUUID();
          prevGroup = e.supersetGroup;
          const sets = Math.min(20, Math.max(1, Math.round(e.sets) || 1));
          return {
            variationId: variation.id,
            position: i,
            lineageId: crypto.randomUUID(),
            sectionName: e.sectionName?.trim().slice(0, 40) || null,
            supersetKey: key,
            name: e.name.trim().slice(0, 120),
            sets,
            measurement: "reps" as const,
            repScheme: e.repScheme,
            repsMin: e.repScheme === "failure" ? null : Math.min(999, Math.max(1, Math.round(e.repsMin ?? 10))),
            repsMax: e.repScheme === "range" ? Math.min(999, Math.max(1, Math.round(e.repsMax ?? 15))) : null,
            timeSeconds: null,
            restOverrideSeconds: null,
            note: e.note?.trim().slice(0, 500) || null,
            weightUnit: e.weightUnit === "bricks" ? ("bricks" as const) : ("kg" as const),
            targetWeight: e.targetWeight == null ? null : Math.max(0, e.targetWeight),
          };
        });
      if (rows.length) await tx.insert(schema.exercises).values(rows);
    }
  });
  revalidatePath("/workouts");
  redirect(firstDayId ? `/workouts/${firstDayId}` : "/workouts");
}
```

- [ ] **Step 2: Rewrite `ImportWizard`**

Replace `src/components/ImportWizard.tsx` with a version that: has a **program-name** input (default `"Imported program"`); a paste `<textarea>` + CSV file `<input type=file>`; a **"Download example.csv"** link (`<a href="/example.csv" download>`); parses with `parseWorkoutCsv`; shows a preview (per day: its name + a list of exercises with section/scheme/target/superset badges) and any `warnings`; and an **Import** button (disabled while empty) calling `importProgram(programName, result.days)`. Follow the existing wizard's dark styling and its `useTransition`/error pattern (the old file is a reference for structure; the data shape changes to `ProgramParseResult`). Import types from `@/lib/import` (`parseWorkoutCsv`, `ProgramDay`) and `@/app/actions` (`importProgram`, `ImportProgramDay`). Map `result.days` → `ImportProgramDay[]` (identical shape) for the action call.

- [ ] **Step 3: `public/example.csv`**

Create `public/example.csv`:

```csv
Day: Push
Section: Chest
Bench press,4,kg,fixed,8,60,,
Incline dumbbell,4,kg,range,8-12,22.5,,
Section: Triceps
Pushdown,3,bricks,fixed,12,20,supA,
Overhead extension,3,kg,fixed,12,15,supA,keep elbows tucked
Day: Pull
Section: Back
Pull-up,3,bricks,failure,,,,
Barbell row,4,kg,range,6-10,60,,
Section: Biceps
Barbell curl,3,kg,fixed,10,30,,
```

- [ ] **Step 4: Retire the old dense importer**

Remove from `src/lib/import.ts`: `parseSpreadsheet`, `parseSessionCell`, `parseWeightCell`, `parseRepList`, and their now-unused types (`ImportedSet`, `ImportedCell`, the OLD `ImportedExercise`/`ImportedDay`/`ParseResult`) and any private helpers used ONLY by them (e.g. `tokenizeCell`, `tokenizations`, `parseDate` — but KEEP `splitRows`/`parseCsvLine`, used by `parseWorkoutCsv`). Remove the corresponding old tests from `src/lib/import.test.ts` (the `parseWorkoutCsv` tests stay). Confirm nothing else imports the removed symbols (`grep -rn "parseSpreadsheet\|parseSessionCell\|parseWeightCell\|parseRepList\|importSpreadsheet\|ImportDayPayload" src`).

- [ ] **Step 5: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint` — green (new parser tests pass; old dense tests gone; whole app compiles). `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/import` → 307; `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/example.csv` → 200.
Commit: `git add -A && git commit -m "feat: explicit-format import + downloadable example.csv; retire dense parser"`

---

### Task 3: End-to-end verification

- [ ] **Step 1: Static gates** — `npm test && npx tsc --noEmit && npm run lint && npm run build` green.

- [ ] **Step 2: Authenticated runtime (controller drives)**

1. `/example.csv` downloads and matches the template.
2. On `/import`: paste the example, set a program name; the preview shows Push/Pull days with Chest/Triceps/Back/Biceps sections, the range/failure schemes, target weights, and the `supA` superset.
3. Import → redirects to the first imported day; its Plan shows the sections/supersets/targets; the day is trainable (Start → runner shows the imported exercises with target-weight prefill and OK/range quick-entry per scheme).
4. A malformed paste (exercise row before any `Day:`) shows a warning in the preview and is skipped, not a crash.

- [ ] **Step 3: Commit any fixes** — `git add -A && git commit -m "fix: stage 5 polish from verification"` (only if needed).
