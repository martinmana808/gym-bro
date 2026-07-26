# Duplicate + Spreadsheet View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add duplicate/rename for a whole workout (plan only), and a read-only "Spreadsheet view" page that renders the entire workout + all sessions like the source spreadsheet.

**Spec:** `docs/superpowers/specs/2026-07-26-duplicate-and-spreadsheet-view.md`

## Global Constraints

- No schema/table migration. Reuse `programs/days/variations/exercises/sessions/set_logs`.
- Duplicate copies the **plan only** (days, weeks, exercises) — never sessions/logs. Preserve lineage + superset grouping *within the copy* via consistent old→new id maps.
- Sheet view is **read-only**; uses `formatTarget`, `formatTargetWeight`, `formatSessionCell` from `src/lib/workout.ts`.
- Ownership always via `program.userId`.
- Verify `npm test && npx tsc --noEmit && npm run lint` before each commit. Commit per task. Controller deploys.
- Do not start a server (controller-managed).

---

### Task 1: `buildSheetRows` helper (TDD) + `getProgramSheet` query

**Files:** `src/lib/sheet.ts`, `src/lib/sheet.test.ts`, `src/db/queries.ts`

**Interfaces (Produces):**
```ts
// src/lib/sheet.ts
export type SheetTargetCell = { target: string; sessions: string[] }; // one week's cell for a row
export type SheetRow = { key: string; name: string; sectionName: string | null; weightUnit: "kg" | "bricks"; byWeek: (SheetTargetCell | null)[] };
export type SheetWeekMeta = { position: number; name: string; sessions: { id: string; label: string }[] };

/** Align exercises across weeks into ordered rows. `weeks[i].exercises` are that
 * week's exercises in order; `cell(ex, weekIndex)` renders that exercise's cell
 * (target + per-session strings) for the week. Rows are keyed by lineageId, else
 * name; row order = first appearance scanning weeks in order. */
export function buildSheetRows(
  weeks: { exercises: { id: string; lineageId: string; name: string; sectionName: string | null; weightUnit: "kg" | "bricks" }[] }[],
  cell: (exId: string, weekIndex: number) => SheetTargetCell,
): SheetRow[];
```

- [ ] **Step 1: Tests** — create `src/lib/sheet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSheetRows } from "./sheet";

const ex = (id: string, lineageId: string, name: string, sectionName: string | null = null) => ({
  id, lineageId, name, sectionName, weightUnit: "kg" as const,
});
const cell = (exId: string, w: number) => ({ target: `${exId}@${w}`, sessions: [] });

describe("buildSheetRows", () => {
  it("aligns the same lineage across weeks onto one row, in first-appearance order", () => {
    const rows = buildSheetRows(
      [
        { exercises: [ex("a1", "L1", "Bench"), ex("b1", "L2", "Row")] },
        { exercises: [ex("a2", "L1", "Bench"), ex("b2", "L2", "Row")] },
      ],
      cell,
    );
    expect(rows.map((r) => r.name)).toEqual(["Bench", "Row"]);
    expect(rows[0].byWeek.map((c) => c?.target)).toEqual(["a1@0", "a2@1"]);
  });

  it("leaves a null cell where a week lacks the exercise, and appends new exercises", () => {
    const rows = buildSheetRows(
      [
        { exercises: [ex("a1", "L1", "Bench")] },
        { exercises: [ex("a2", "L1", "Bench"), ex("c1", "L3", "Fly")] },
      ],
      cell,
    );
    expect(rows.map((r) => r.name)).toEqual(["Bench", "Fly"]);
    expect(rows[1].byWeek.map((c) => c?.target ?? null)).toEqual([null, "c1@1"]);
  });

  it("falls back to name when lineages differ", () => {
    const rows = buildSheetRows(
      [{ exercises: [ex("a1", "X", "Bench")] }, { exercises: [ex("a2", "Y", "Bench")] }],
      cell,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].byWeek.map((c) => c?.target)).toEqual(["a1@0", "a2@1"]);
  });
});
```

- [ ] **Step 2: Run → RED** (`npm test -- sheet`).

- [ ] **Step 3: Implement** `src/lib/sheet.ts`:

```ts
export type SheetTargetCell = { target: string; sessions: string[] };
export type SheetRow = {
  key: string;
  name: string;
  sectionName: string | null;
  weightUnit: "kg" | "bricks";
  byWeek: (SheetTargetCell | null)[];
};
export type SheetWeekMeta = { position: number; name: string; sessions: { id: string; label: string }[] };

export function buildSheetRows(
  weeks: {
    exercises: {
      id: string;
      lineageId: string;
      name: string;
      sectionName: string | null;
      weightUnit: "kg" | "bricks";
    }[];
  }[],
  cell: (exId: string, weekIndex: number) => SheetTargetCell,
): SheetRow[] {
  const rows: SheetRow[] = [];
  const indexByKey = new Map<string, number>();
  const keyOf = (e: { lineageId: string; name: string }) => `${e.lineageId}|${e.name.toLowerCase()}`;
  // First pass with lineage+name, but also merge rows whose name matches when
  // lineage differs: track a name→row index as a fallback.
  const indexByName = new Map<string, number>();
  weeks.forEach((week, wi) => {
    for (const e of week.exercises) {
      const k = keyOf(e);
      let idx = indexByKey.get(k);
      if (idx == null) idx = indexByName.get(e.name.toLowerCase());
      if (idx == null) {
        idx = rows.length;
        rows.push({
          key: k,
          name: e.name,
          sectionName: e.sectionName,
          weightUnit: e.weightUnit,
          byWeek: weeks.map(() => null),
        });
        indexByKey.set(k, idx);
        indexByName.set(e.name.toLowerCase(), idx);
      } else {
        indexByKey.set(k, idx);
      }
      rows[idx].byWeek[wi] = cell(e.id, wi);
    }
  });
  return rows;
}
```

- [ ] **Step 4: Run → GREEN** (`npm test -- sheet && npx tsc --noEmit && npm run lint`).

- [ ] **Step 5: `getProgramSheet` query** — append to `src/db/queries.ts` (imports: `buildSheetRows`, `SheetRow`, `SheetWeekMeta` from `@/lib/sheet`; `formatTarget`, `formatTargetWeight`, `formatSessionCell` from `@/lib/workout`; existing drizzle helpers):

```ts
export type ProgramSheetDay = { id: string; name: string; weeks: SheetWeekMeta[]; rows: SheetRow[] };
export type ProgramSheet = { program: { id: string; name: string }; days: ProgramSheetDay[] };

/** The whole workout as a spreadsheet: per day, weeks as column groups (Target +
 * a column per finished session), exercises aligned across weeks as rows. */
export async function getProgramSheet(programId: string, userId: string): Promise<ProgramSheet | null> {
  const db = await getDb();
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  const dayIds = days.map((d) => d.id);
  const vars = dayIds.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, dayIds),
        orderBy: asc(schema.variations.position),
      })
    : [];
  const varIds = vars.map((v) => v.id);
  const exercises = varIds.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.variationId, varIds),
        orderBy: asc(schema.exercises.position),
      })
    : [];
  const sessions = dayIds.length
    ? await db.query.sessions.findMany({
        where: inArray(schema.sessions.dayId, dayIds),
        orderBy: asc(schema.sessions.startedAt),
      })
    : [];
  const finished = sessions.filter((s) => s.finishedAt);
  const logs = finished.length
    ? await db.query.setLogs.findMany({
        where: inArray(schema.setLogs.sessionId, finished.map((s) => s.id)),
        orderBy: asc(schema.setLogs.setNumber),
      })
    : [];

  const outDays: ProgramSheetDay[] = days.map((day) => {
    const dayVars = vars.filter((v) => v.dayId === day.id);
    const weekMetas: SheetWeekMeta[] = dayVars.map((v) => {
      const vSessions = finished.filter((s) => s.variationId === v.id);
      return {
        position: v.position,
        name: v.name,
        sessions: vSessions.map((s) => ({
          id: s.id,
          label: s.startedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        })),
      };
    });
    const weeksForRows = dayVars.map((v) => ({
      exercises: exercises
        .filter((e) => e.variationId === v.id)
        .map((e) => ({
          id: e.id,
          lineageId: e.lineageId,
          name: e.name,
          sectionName: e.sectionName,
          weightUnit: e.weightUnit,
        })),
    }));
    const exById = new Map(exercises.map((e) => [e.id, e]));
    const cell = (exId: string, weekIndex: number) => {
      const e = exById.get(exId)!;
      const target =
        formatTarget(e) + (e.targetWeight != null ? ` · ${formatTargetWeight(e)}` : "");
      const meta = weekMetas[weekIndex];
      const sessions = meta.sessions.map((s) => {
        const cellLogs = logs.filter((l) => l.sessionId === s.id && l.exerciseId === exId);
        return formatSessionCell(cellLogs, e.weightUnit, null);
      });
      return { target, sessions };
    };
    const rows = buildSheetRows(weeksForRows, cell);
    return { id: day.id, name: day.name, weeks: weekMetas, rows };
  });
  return { program: { id: program.id, name: program.name }, days: outDays };
}
```

- [ ] **Step 6:** `npm test && npx tsc --noEmit && npm run lint`; commit:
`git add src/lib/sheet.ts src/lib/sheet.test.ts src/db/queries.ts && git commit -m "feat: buildSheetRows + getProgramSheet (spreadsheet data)"`

Note: confirm `formatTarget`/`formatTargetWeight`/`formatSessionCell` signatures in `src/lib/workout.ts` and adjust the calls to match (they are already used by `src/app/workouts/[id]/days/[dayId]/page.tsx`).

---

### Task 2: Spreadsheet page + hub link

**Files:** `src/app/workouts/[id]/sheet/page.tsx` (create), `src/app/workouts/[id]/page.tsx` (add link)

**Interfaces:** Consumes `getProgramSheet` (Task 1).

- [ ] **Step 1: Page** — create `src/app/workouts/[id]/sheet/page.tsx`:

```tsx
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getProgramSheet } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const sheet = await getProgramSheet(id, userId);
  if (!sheet) notFound();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-12 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${id}`}
          aria-label="Back to workout"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{sheet.program.name}</h1>
          <p className="text-sm text-zinc-400">Spreadsheet view · all weeks &amp; sessions</p>
        </div>
      </header>

      {sheet.days.map((day) => (
        <section key={day.id} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {day.name}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-900/70">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-10 bg-zinc-900/70 px-3 py-2 text-left font-medium text-zinc-300"
                  >
                    Exercise
                  </th>
                  {day.weeks.map((w) => (
                    <th
                      key={w.position}
                      colSpan={1 + w.sessions.length}
                      className="border-l border-zinc-800 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-lime-400"
                    >
                      {w.name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-zinc-900/50 text-zinc-400">
                  {day.weeks.map((w) => (
                    <Fragment key={w.position}>
                      <th className="border-l border-zinc-800 px-3 py-1.5 text-left font-medium">
                        Target
                      </th>
                      {w.sessions.map((s) => (
                        <th key={s.id} className="px-3 py-1.5 text-left font-normal">
                          <Link href={`/sessions/${s.id}`} className="hover:text-lime-400">
                            {s.label}
                          </Link>
                        </th>
                      ))}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, ri) => {
                  const prevSection = ri > 0 ? day.rows[ri - 1].sectionName : null;
                  const showSection = row.sectionName && row.sectionName !== prevSection;
                  const totalCols = 1 + day.weeks.reduce((n, w) => n + 1 + w.sessions.length, 0);
                  return (
                    <Fragment key={row.key + ri}>
                      {showSection && (
                        <tr>
                          <td
                            colSpan={totalCols}
                            className="border-l-2 border-lime-400 bg-zinc-900/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-lime-400"
                          >
                            {row.sectionName}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-zinc-800/60">
                        <td className="sticky left-0 z-10 bg-zinc-950/95 px-3 py-2 font-medium">
                          {row.name}
                        </td>
                        {row.byWeek.map((c, wi) => (
                          <Fragment key={wi}>
                            <td className="border-l border-zinc-800 px-3 py-2 tabular-nums text-zinc-400">
                              {c?.target ?? ""}
                            </td>
                            {day.weeks[wi].sessions.map((s, si) => (
                              <td key={s.id} className="px-3 py-2 tabular-nums text-zinc-300">
                                {c?.sessions[si] ?? ""}
                              </td>
                            ))}
                          </Fragment>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
                {day.rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500">No exercises yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Hub link** — in `src/app/workouts/[id]/page.tsx`, add a link to the sheet near the top of the hub (below `WeekTabs`, above `DaysList`):

```tsx
      <Link
        href={`/workouts/${hub.program.id}/sheet`}
        className="text-center text-sm text-zinc-400 underline underline-offset-2 transition hover:text-lime-400"
      >
        📊 Spreadsheet view (all weeks &amp; sessions)
      </Link>
```
(Import `Link` is already present in the hub page.)

- [ ] **Step 3:** `npm test && npx tsc --noEmit && npm run lint && npm run build`; commit:
`git add -A && git commit -m "feat: read-only spreadsheet view of the whole workout"`

---

### Task 3: Duplicate + rename program

**Files:** `src/app/actions.ts`, `src/components/HubActions.tsx` (create), `src/app/workouts/[id]/page.tsx`

**Interfaces (Produces):**
```ts
export async function renameProgram(programId: string, name: string): Promise<void>;
export async function duplicateProgram(programId: string): Promise<void>; // redirects to new hub
```

- [ ] **Step 1: Actions** — append to `src/app/actions.ts` (reuse `ownedProgram`):

```ts
export async function renameProgram(programId: string, name: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  await db
    .update(schema.programs)
    .set({ name: name.trim().slice(0, 80) || "Workout" })
    .where(eq(schema.programs.id, programId));
  revalidatePath("/workouts");
  revalidatePath(`/workouts/${programId}`);
}

/** Clone a program's PLAN (days, weeks, exercises) into a new program. Does not
 * copy sessions/logs. Lineage + superset grouping are preserved within the copy
 * via consistent old→new id maps. */
export async function duplicateProgram(programId: string) {
  const userId = await requireUserId();
  const source = await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  const vars = days.length
    ? await db.query.variations.findMany({ where: inArray(schema.variations.dayId, days.map((d) => d.id)) })
    : [];
  const exercises = vars.length
    ? await db.query.exercises.findMany({ where: inArray(schema.exercises.variationId, vars.map((v) => v.id)) })
    : [];
  const lineageMap = new Map<string, string>();
  const supersetMap = new Map<string, string>();
  const mapId = (m: Map<string, string>, k: string | null) => {
    if (k == null) return null;
    let v = m.get(k);
    if (!v) {
      v = crypto.randomUUID();
      m.set(k, v);
    }
    return v;
  };
  let newProgramId = "";
  await db.transaction(async (tx) => {
    const [program] = await tx
      .insert(schema.programs)
      .values({ userId, name: `${source.name} copy`.slice(0, 80) })
      .returning({ id: schema.programs.id });
    newProgramId = program.id;
    for (const d of days) {
      const [nd] = await tx
        .insert(schema.days)
        .values({ programId: program.id, position: d.position, name: d.name, defaultRestSeconds: d.defaultRestSeconds })
        .returning({ id: schema.days.id });
      const dayVars = vars.filter((v) => v.dayId === d.id).sort((a, b) => a.position - b.position);
      for (const v of dayVars) {
        const [nv] = await tx
          .insert(schema.variations)
          .values({ dayId: nd.id, position: v.position, name: v.name })
          .returning({ id: schema.variations.id });
        const vExs = exercises
          .filter((e) => e.variationId === v.id)
          .sort((a, b) => a.position - b.position);
        if (vExs.length) {
          await tx.insert(schema.exercises).values(
            vExs.map((e) => ({
              variationId: nv.id,
              position: e.position,
              lineageId: mapId(lineageMap, e.lineageId)!,
              sectionName: e.sectionName,
              supersetKey: mapId(supersetMap, e.supersetKey),
              name: e.name,
              sets: e.sets,
              measurement: e.measurement,
              repScheme: e.repScheme,
              repsMin: e.repsMin,
              repsMax: e.repsMax,
              timeSeconds: e.timeSeconds,
              restOverrideSeconds: e.restOverrideSeconds,
              note: e.note,
              weightUnit: e.weightUnit,
              targetWeight: e.targetWeight,
            })),
          );
        }
      }
    }
  });
  revalidatePath("/workouts");
  redirect(`/workouts/${newProgramId}`);
}
```

- [ ] **Step 2: HubActions component** — create `src/components/HubActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { renameProgram, duplicateProgram } from "@/app/actions";

export function HubActions({ programId, name }: { programId: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {renaming ? (
        <form
          action={async (fd: FormData) => {
            await renameProgram(programId, String(fd.get("name") ?? ""));
            setRenaming(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="name"
            defaultValue={name}
            autoFocus
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 focus:border-lime-400 focus:outline-none"
          />
          <button className="text-lime-400">Save</button>
        </form>
      ) : (
        <button onClick={() => setRenaming(true)} className="text-zinc-400 transition hover:text-zinc-200">
          Rename workout
        </button>
      )}
      <form action={duplicateProgram.bind(null, programId)}>
        <button className="text-zinc-400 transition hover:text-lime-400">Duplicate workout</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Place it on the hub** — in `src/app/workouts/[id]/page.tsx`, import `HubActions` and render it under the header (above `WeekTabs`):

```tsx
      <HubActions programId={hub.program.id} name={hub.program.name} />
```

- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint && npm run build`; commit:
`git add -A && git commit -m "feat: duplicate a workout (plan only) and rename it from the hub"`

---

### Task 4: Verify + deploy

- [ ] `npm test && npx tsc --noEmit && npm run lint && npm run build` green. Controller: on the seeded program, open Spreadsheet view (weeks as column groups with real logs), Duplicate it (renamed copy, empty history), delete the copy; then `vercel deploy --prod`.
