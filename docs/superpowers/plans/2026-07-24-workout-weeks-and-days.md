# Workout = Weeks × Days grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make a Workout a program that contains multiple Days (the session unit) and multiple Weeks (progression), surfaced as a grid — with **no schema migration**.

**Architecture:** Keep tables as-is (`programs → days → variations → exercises`, `sessions(dayId, variationId)`). A **Week** is the aligned `variations.position` column across all of a workout's days; a **cell** is one day's variation at a position. New code maintains the invariant that every day shares the same ordered week positions. All the work is query/action helpers + a route restructure so the **program** is the hub.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (PGlite dev / Neon prod), Vitest, Tailwind v4, next-auth v5.

**Spec:** `docs/superpowers/specs/2026-07-24-workout-weeks-and-days-design.md`

## Global Constraints

- **No schema change, no migration.** `src/db/schema.ts` tables are untouched (the only allowed edit is extending the `Workout` **compat type** with `programId`). Variations stay per-day; "week N" = position-N variation across the program's days.
- **Invariant:** within a workout, every day has the same ordered set of week positions `0..N-1`; a week's label is program-global (same `name` on every day's variation at that position). Every mutation preserves this.
- **Normalization is insert-only.** Filling missing `(day, position)` cells may only INSERT empty variations — never delete or move data. Idempotent.
- **History is per-week** (scoped to the selected week's cell), like today's per-variation history — never merge exercise rows across weeks (their exercise ids differ).
- **UI label is "Workout"** for a program, **"Day"** for a day, **"Week"** for a week column.
- Ownership is always checked via the `program.userId` chain before any read/write.
- Verify `npm test && npx tsc --noEmit && npm run lint` before each commit. Commit every task. The controller deploys after.
- Servers are controller-managed — do not start one.

---

### Task 1: Pure week helpers (TDD)

**Files:**
- Create: `src/lib/weeks.ts`
- Create: `src/lib/weeks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WeekCol = { position: number; name: string };
  export function deriveWeeks(daysVariations: { position: number; name: string }[][]): WeekCol[];
  export function missingCells(daysVariations: { position: number }[][], weekCount: number): { dayIndex: number; position: number }[];
  ```

- [ ] **Step 1: Write the failing tests** — create `src/lib/weeks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveWeeks, missingCells } from "./weeks";

describe("deriveWeeks", () => {
  it("returns one column per position with the label from the first day that has it", () => {
    const out = deriveWeeks([
      [{ position: 0, name: "Week 1" }, { position: 1, name: "Week 2" }],
      [{ position: 0, name: "ignored" }, { position: 1, name: "ignored" }],
    ]);
    expect(out).toEqual([
      { position: 0, name: "Week 1" },
      { position: 1, name: "Week 2" },
    ]);
  });

  it("covers positions present in any day (ragged), labelling from the first day that has each", () => {
    const out = deriveWeeks([
      [{ position: 0, name: "A" }],
      [{ position: 0, name: "X" }, { position: 1, name: "B" }],
    ]);
    expect(out).toEqual([
      { position: 0, name: "A" },
      { position: 1, name: "B" },
    ]);
  });

  it("falls back to Week N when no day names a position, and handles empty", () => {
    expect(deriveWeeks([])).toEqual([]);
    expect(deriveWeeks([[]])).toEqual([]);
  });
});

describe("missingCells", () => {
  it("lists (dayIndex, position) cells that have no variation", () => {
    const out = missingCells(
      [[{ position: 0 }, { position: 1 }], [{ position: 0 }]],
      2,
    );
    expect(out).toEqual([{ dayIndex: 1, position: 1 }]);
  });

  it("returns nothing for a rectangular grid", () => {
    expect(
      missingCells([[{ position: 0 }], [{ position: 0 }]], 1),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → RED**

Run: `npm test -- weeks`
Expected: FAIL (cannot find module `./weeks`).

- [ ] **Step 3: Implement** — create `src/lib/weeks.ts`:

```ts
export type WeekCol = { position: number; name: string };

/** Program-global week columns derived from each day's variations. The number
 * of weeks is the max (position + 1) across all days; each column's label comes
 * from the first day (in order) that has a variation at that position, else
 * "Week {n}". */
export function deriveWeeks(
  daysVariations: { position: number; name: string }[][],
): WeekCol[] {
  let count = 0;
  for (const vars of daysVariations)
    for (const v of vars) count = Math.max(count, v.position + 1);
  const cols: WeekCol[] = [];
  for (let p = 0; p < count; p++) {
    let name = `Week ${p + 1}`;
    for (const vars of daysVariations) {
      const hit = vars.find((v) => v.position === p);
      if (hit) {
        name = hit.name;
        break;
      }
    }
    cols.push({ position: p, name });
  }
  return cols;
}

/** Which (dayIndex, position) cells are absent, so a normalize step can fill
 * them with empty variations. */
export function missingCells(
  daysVariations: { position: number }[][],
  weekCount: number,
): { dayIndex: number; position: number }[] {
  const out: { dayIndex: number; position: number }[] = [];
  daysVariations.forEach((vars, dayIndex) => {
    const have = new Set(vars.map((v) => v.position));
    for (let p = 0; p < weekCount; p++)
      if (!have.has(p)) out.push({ dayIndex, position: p });
  });
  return out;
}
```

- [ ] **Step 4: Run → GREEN**

Run: `npm test -- weeks && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weeks.ts src/lib/weeks.test.ts
git commit -m "feat: deriveWeeks/missingCells grid helpers"
```

---

### Task 2: Query layer — program-centric reads + normalize

**Files:**
- Modify: `src/db/schema.ts` (extend the `Workout` compat type only)
- Modify: `src/db/queries.ts`

**Interfaces:**
- Consumes: `deriveWeeks`, `missingCells`, `WeekCol` from `@/lib/weeks` (Task 1).
- Produces:
  ```ts
  // schema.ts: Workout type gains programId
  export type Workout = { id: string; programId: string; userId: string; name: string; defaultRestSeconds: number; createdAt: Date };

  // queries.ts
  export type ProgramListItem = { id: string; name: string; dayCount: number; lastFinishedAt: Date | null; unfinishedSessionId: string | null };
  export async function listPrograms(userId: string): Promise<ProgramListItem[]>;

  export type HubDay = { id: string; name: string; position: number; cellVariationId: string | null; exerciseCount: number; sectionSummary: string; unfinishedSessionId: string | null };
  export type ProgramHub = { program: { id: string; name: string }; weeks: WeekCol[]; selectedWeek: number; days: HubDay[] };
  export async function getProgramHub(programId: string, userId: string, weekParam?: number): Promise<ProgramHub | null>;

  export async function getDayCellVariationId(dayId: string, weekPos: number, userId: string): Promise<string | null>;
  ```

- [ ] **Step 1: Add `programId` to the `Workout` compat type** — in `src/db/schema.ts`, replace the `Workout` type:

```ts
export type Workout = {
  id: string; // = day.id
  programId: string;
  userId: string;
  name: string;
  defaultRestSeconds: number;
  createdAt: Date;
};
```

- [ ] **Step 2: Populate `programId` in the two builders** — in `src/db/queries.ts`, the `dayView` and `ownedDayWorkout` functions build a `Workout`. Add `programId: program.id,` to each returned `workout` object.

`dayView` (around line 24) becomes:
```ts
  const workout: Workout = {
    id: day.id,
    programId: program.id,
    userId: program.userId,
    name: day.name,
    defaultRestSeconds: day.defaultRestSeconds,
    createdAt: program.createdAt,
  };
```
`ownedDayWorkout` (around line 42) becomes:
```ts
  return {
    id: day.id,
    programId: program.id,
    userId: program.userId,
    name: day.name,
    defaultRestSeconds: day.defaultRestSeconds,
    createdAt: program.createdAt,
  };
```

- [ ] **Step 3: Add imports** — at the top of `src/db/queries.ts`, add:
```ts
import { deriveWeeks, missingCells, type WeekCol } from "@/lib/weeks";
```

- [ ] **Step 4: Add the new query functions** — append to `src/db/queries.ts`:

```ts
/** Insert-only: pad any missing (day, position) cell in a program with an empty
 * variation labelled from the week column. Idempotent; never deletes or moves. */
async function normalizeProgram(programId: string): Promise<void> {
  const db = await getDb();
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  if (!days.length) return;
  const vars = await db.query.variations.findMany({
    where: inArray(schema.variations.dayId, days.map((d) => d.id)),
  });
  const byDay = days.map((d) => vars.filter((v) => v.dayId === d.id));
  const weeks = deriveWeeks(byDay.map((vs) => vs.map((v) => ({ position: v.position, name: v.name }))));
  const gaps = missingCells(byDay.map((vs) => vs.map((v) => ({ position: v.position }))), weeks.length);
  if (!gaps.length) return;
  await db.insert(schema.variations).values(
    gaps.map((g) => ({
      dayId: days[g.dayIndex].id,
      position: g.position,
      name: weeks[g.position].name,
    })),
  );
}

export type ProgramListItem = {
  id: string;
  name: string;
  dayCount: number;
  lastFinishedAt: Date | null;
  unfinishedSessionId: string | null;
};

/** One row per program (a "Workout"): day count, last finished session, any
 * unfinished session across its days. */
export async function listPrograms(userId: string): Promise<ProgramListItem[]> {
  const db = await getDb();
  const programs = await db.query.programs.findMany({
    where: eq(schema.programs.userId, userId),
    orderBy: asc(schema.programs.createdAt),
  });
  if (!programs.length) return [];
  const days = await db.query.days.findMany({
    where: inArray(schema.days.programId, programs.map((p) => p.id)),
  });
  const dayIds = days.map((d) => d.id);
  const sessions = dayIds.length
    ? await db.query.sessions.findMany({
        where: inArray(schema.sessions.dayId, dayIds),
        orderBy: desc(schema.sessions.startedAt),
      })
    : [];
  return programs.map((p) => {
    const pd = days.filter((d) => d.programId === p.id);
    const pdIds = new Set(pd.map((d) => d.id));
    const ps = sessions.filter((s) => pdIds.has(s.dayId));
    return {
      id: p.id,
      name: p.name,
      dayCount: pd.length,
      lastFinishedAt: ps.find((s) => s.finishedAt)?.finishedAt ?? null,
      unfinishedSessionId: ps.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
}

export type HubDay = {
  id: string;
  name: string;
  position: number;
  cellVariationId: string | null;
  exerciseCount: number;
  sectionSummary: string;
  unfinishedSessionId: string | null;
};
export type ProgramHub = {
  program: { id: string; name: string };
  weeks: WeekCol[];
  selectedWeek: number;
  days: HubDay[];
};

/** The workout hub: week columns + the days, each resolved to its cell for the
 * selected week. `weekParam` (a position) selects the week; default is the week
 * of the most recent session, else the last week. */
export async function getProgramHub(
  programId: string,
  userId: string,
  weekParam?: number,
): Promise<ProgramHub | null> {
  const db = await getDb();
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  await normalizeProgram(programId);
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
  const byDay = days.map((d) => vars.filter((v) => v.dayId === d.id));
  const weeks = deriveWeeks(byDay.map((vs) => vs.map((v) => ({ position: v.position, name: v.name }))));
  const sessions = dayIds.length
    ? await db.query.sessions.findMany({
        where: inArray(schema.sessions.dayId, dayIds),
        orderBy: desc(schema.sessions.startedAt),
      })
    : [];
  let selectedWeek = weeks.length ? weeks[weeks.length - 1].position : 0;
  if (weekParam != null && weeks.some((w) => w.position === weekParam)) {
    selectedWeek = weekParam;
  } else if (sessions[0]) {
    const lv = vars.find((v) => v.id === sessions[0].variationId);
    if (lv) selectedWeek = lv.position;
  }
  const cellVarByDay = new Map<string, string | null>(
    days.map((d, i) => [d.id, byDay[i].find((v) => v.position === selectedWeek)?.id ?? null]),
  );
  const cellIds = [...cellVarByDay.values()].filter((x): x is string => !!x);
  const exs = cellIds.length
    ? await db.query.exercises.findMany({ where: inArray(schema.exercises.variationId, cellIds) })
    : [];
  const hubDays: HubDay[] = days.map((d) => {
    const cid = cellVarByDay.get(d.id) ?? null;
    const de = exs.filter((e) => e.variationId === cid);
    const sections = [...new Set(de.map((e) => e.sectionName).filter((s): s is string => !!s))];
    const mine = sessions.filter((s) => s.dayId === d.id);
    return {
      id: d.id,
      name: d.name,
      position: d.position,
      cellVariationId: cid,
      exerciseCount: de.length,
      sectionSummary: sections.join(" · "),
      unfinishedSessionId: mine.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
  return { program: { id: program.id, name: program.name }, weeks, selectedWeek, days: hubDays };
}

/** The variation id for a given (day, week position), or null. Used by the day
 * detail and cell-edit pages. Verifies ownership. */
export async function getDayCellVariationId(
  dayId: string,
  weekPos: number,
  userId: string,
): Promise<string | null> {
  const owned = await ownedDayWorkout(dayId, userId);
  if (!owned) return null;
  const db = await getDb();
  const v = await db.query.variations.findFirst({
    where: and(eq(schema.variations.dayId, dayId), eq(schema.variations.position, weekPos)),
  });
  return v?.id ?? null;
}
```

- [ ] **Step 5: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (existing tests unaffected; `Workout.programId` now set everywhere it's built).

```bash
git add src/db/schema.ts src/db/queries.ts
git commit -m "feat: program-centric queries (listPrograms, getProgramHub, cell resolver) + normalize"
```

---

### Task 3: Actions — day & week management

**Files:**
- Modify: `src/app/actions.ts`

**Interfaces:**
- Consumes: `deriveWeeks` from `@/lib/weeks`; existing `ownedDay`, `ownedProgram` (new), `requireUserId`, `getDb`, `schema`.
- Produces:
  ```ts
  export async function addDay(programId: string): Promise<void>;
  export async function renameDay(dayId: string, name: string): Promise<void>;
  export async function deleteDay(dayId: string): Promise<void>;
  export async function deleteProgram(programId: string): Promise<void>;
  export async function addWeek(programId: string, sourceWeekPos: number): Promise<void>;
  export async function renameWeek(programId: string, weekPos: number, name: string): Promise<void>;
  export async function deleteWeek(programId: string, weekPos: number): Promise<void>;
  ```
  (These redirect to the new hub route `/workouts/${programId}`, which Task 4 introduces. They are not called by any UI until Task 4.)

- [ ] **Step 1: Import the helper** — at the top of `src/app/actions.ts` add:
```ts
import { deriveWeeks } from "@/lib/weeks";
```

- [ ] **Step 2: Add an `ownedProgram` helper** — after the existing `ownedVariation` function (around line 157), add:

```ts
/** Verify the program belongs to the user; return it. */
async function ownedProgram(programId: string, userId: string) {
  const db = await getDb();
  const p = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)),
  });
  if (!p) throw new Error("Workout not found");
  return p;
}
```

- [ ] **Step 3: Add the day actions** — append to `src/app/actions.ts`:

```ts
/** Add a day to a workout. The new day gets an (empty) cell for every existing
 * week so it is trainable in each. */
export async function addDay(programId: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  const allVars = days.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, days.map((d) => d.id)),
      })
    : [];
  const byDay = days.map((d) => allVars.filter((v) => v.dayId === d.id));
  const weeks = deriveWeeks(byDay.map((vs) => vs.map((v) => ({ position: v.position, name: v.name }))));
  const cols = weeks.length ? weeks : [{ position: 0, name: "Week 1" }];
  await db.transaction(async (tx) => {
    const [day] = await tx
      .insert(schema.days)
      .values({ programId, position: days.length, name: `Day ${days.length + 1}`, defaultRestSeconds: 90 })
      .returning({ id: schema.days.id });
    await tx.insert(schema.variations).values(
      cols.map((c) => ({ dayId: day.id, position: c.position, name: c.name })),
    );
  });
  revalidatePath(`/workouts/${programId}`);
  redirect(`/workouts/${programId}`);
}

export async function renameDay(dayId: string, name: string) {
  const userId = await requireUserId();
  const day = await ownedDay(dayId, userId);
  const db = await getDb();
  await db
    .update(schema.days)
    .set({ name: name.trim().slice(0, 80) || "Day" })
    .where(eq(schema.days.id, dayId));
  revalidatePath(`/workouts/${day.programId}`);
}

/** Delete a day (cascades its variations/exercises/sessions). Deleting the last
 * day deletes the whole workout. */
export async function deleteDay(dayId: string) {
  const userId = await requireUserId();
  const day = await ownedDay(dayId, userId);
  const db = await getDb();
  await db.delete(schema.days).where(eq(schema.days.id, dayId));
  const remaining = await db.query.days.findFirst({
    where: eq(schema.days.programId, day.programId),
  });
  if (!remaining) {
    await db.delete(schema.programs).where(eq(schema.programs.id, day.programId));
    revalidatePath("/workouts");
    redirect("/workouts");
  }
  revalidatePath(`/workouts/${day.programId}`);
  redirect(`/workouts/${day.programId}`);
}

export async function deleteProgram(programId: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  await db.delete(schema.programs).where(eq(schema.programs.id, programId));
  revalidatePath("/workouts");
  redirect("/workouts");
}
```

- [ ] **Step 4: Add the week actions** — append to `src/app/actions.ts`:

```ts
/** Add a week to a workout by copying `sourceWeekPos` forward for every day
 * (exercises included, fresh lineage — a copy until the user aligns it). */
export async function addWeek(programId: string, sourceWeekPos: number) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({ where: eq(schema.days.programId, programId) });
  const allVars = days.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, days.map((d) => d.id)),
      })
    : [];
  const newPos = Math.max(0, ...allVars.map((v) => v.position + 1));
  // Read each day's source-week exercises up front (outside the tx).
  const sources = await Promise.all(
    days.map(async (d) => {
      const src = allVars.find((v) => v.dayId === d.id && v.position === sourceWeekPos);
      const exercises = src
        ? await db.query.exercises.findMany({
            where: eq(schema.exercises.variationId, src.id),
            orderBy: asc(schema.exercises.position),
          })
        : [];
      return { dayId: d.id, exercises };
    }),
  );
  await db.transaction(async (tx) => {
    for (const s of sources) {
      const [nv] = await tx
        .insert(schema.variations)
        .values({ dayId: s.dayId, position: newPos, name: `Week ${newPos + 1}` })
        .returning({ id: schema.variations.id });
      if (s.exercises.length) {
        await tx.insert(schema.exercises).values(
          s.exercises.map((e) => ({
            variationId: nv.id,
            position: e.position,
            lineageId: crypto.randomUUID(),
            sectionName: e.sectionName,
            supersetKey: e.supersetKey,
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
  });
  revalidatePath(`/workouts/${programId}`);
  redirect(`/workouts/${programId}?week=${newPos}`);
}

/** Rename a week program-wide (updates every day's variation at that position). */
export async function renameWeek(programId: string, weekPos: number, name: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({ where: eq(schema.days.programId, programId) });
  const clean = name.trim().slice(0, 60) || `Week ${weekPos + 1}`;
  await db
    .update(schema.variations)
    .set({ name: clean })
    .where(
      and(inArray(schema.variations.dayId, days.map((d) => d.id)), eq(schema.variations.position, weekPos)),
    );
  revalidatePath(`/workouts/${programId}`);
}

/** Delete a week from every day and reindex later weeks so positions stay
 * contiguous. Refuses to delete the last remaining week. */
export async function deleteWeek(programId: string, weekPos: number) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({ where: eq(schema.days.programId, programId) });
  const allVars = days.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, days.map((d) => d.id)),
      })
    : [];
  const weekCount = Math.max(0, ...allVars.map((v) => v.position + 1));
  if (weekCount <= 1) throw new Error("A workout needs at least one week");
  const toDelete = allVars.filter((v) => v.position === weekPos).map((v) => v.id);
  const toShift = allVars.filter((v) => v.position > weekPos);
  await db.transaction(async (tx) => {
    if (toDelete.length) await tx.delete(schema.variations).where(inArray(schema.variations.id, toDelete));
    for (const v of toShift) {
      await tx
        .update(schema.variations)
        .set({ position: v.position - 1 })
        .where(eq(schema.variations.id, v.id));
    }
  });
  revalidatePath(`/workouts/${programId}`);
  redirect(`/workouts/${programId}`);
}
```

- [ ] **Step 5: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git add src/app/actions.ts
git commit -m "feat: day & week management actions (add/rename/delete day, program, week)"
```

---

### Task 4: Route flip — program hub, day detail, cell edit

This is the atomic switch: the program becomes the hub and day pages nest under it. All steps ship together.

**Files:**
- Rewrite: `src/app/workouts/page.tsx` (list programs)
- Rewrite: `src/app/workouts/[id]/page.tsx` → **program hub** (`[id]` now = programId)
- Create: `src/app/workouts/[id]/days/[dayId]/page.tsx` (day detail)
- Create: `src/app/workouts/[id]/days/[dayId]/edit/page.tsx` (cell edit)
- Delete: `src/app/workouts/[id]/edit/page.tsx` (old day-edit)
- Create: `src/components/WeekTabs.tsx` (week selector + add/rename/delete week)
- Create: `src/components/DaysList.tsx` (hub day rows + add/rename/delete day)
- Modify: `src/app/actions.ts` (redirect targets → hub / day detail)
- Modify: `src/app/sessions/[id]/page.tsx` and `src/components/SessionRunner.tsx` (back-links → day detail)
- Modify: `src/components/WorkoutBuilder.tsx` (edit-save redirect is via `updateVariation`; no code change needed beyond Task-4 action edits — verify only)

**Interfaces:**
- Consumes: `listPrograms`, `getProgramHub`, `getDayCellVariationId`, `getVariationStructure`, `getWorkoutHistory`, `getUnfinishedSession`, `listDayVariations` (queries); `addDay`, `renameDay`, `deleteDay`, `deleteProgram`, `addWeek`, `renameWeek`, `deleteWeek`, `startSession`, `deleteSession`, `deleteWorkout`→removed (use `deleteDay`).

- [ ] **Step 1: Redirect targets in `actions.ts`** — point existing actions at the new routes. Make these exact edits:

  - `createWorkout`: change the final redirect. It currently captures `dayId`; also capture `programId`.
    Replace the transaction's `dayId = day.id;` bookkeeping and the redirect:
    ```ts
    // add near the top of createWorkout, before the transaction:
    let programId = "";
    // inside the tx, after inserting the program:
    programId = program.id;
    // replace the final two lines:
    revalidatePath("/workouts");
    redirect(`/workouts/${programId}`);
    ```
    (Remove the now-unused `dayId` variable.)
  - `updateVariation`: change the final redirect from `/workouts/${dayId}?v=${variationId}` to the day detail. We need the program id and the week position. Fetch them before redirecting:
    ```ts
    // replace the closing block of updateVariation:
    const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
    revalidatePath("/workouts");
    revalidatePath(`/workouts/${day!.programId}`);
    redirect(`/workouts/${day!.programId}/days/${dayId}?week=${variation.position}`);
    ```
    (`variation` is already in scope from `ownedVariation`; it has `.position`.)
  - `importProgram`: change the final redirect to the hub. Replace `firstDayId` capture with `programId`:
    ```ts
    // capture program.id into an outer `let programId = "";` set inside the tx,
    // then:
    revalidatePath("/workouts");
    redirect(programId ? `/workouts/${programId}` : "/workouts");
    ```
  - `startSession`: unchanged (redirects to `/sessions/...`).
  - `finishSession`: change `revalidatePath(`/workouts/${session.dayId}`)`. Resolve the program:
    ```ts
    const day = await db.query.days.findFirst({ where: eq(schema.days.id, session.dayId) });
    revalidatePath(`/workouts/${day!.programId}/days/${session.dayId}`);
    revalidatePath("/workouts");
    ```
  - `deleteSession`: change redirect to the day detail:
    ```ts
    const day = await db.query.days.findFirst({ where: eq(schema.days.id, session.dayId) });
    revalidatePath(`/workouts/${day!.programId}/days/${session.dayId}`);
    redirect(`/workouts/${day!.programId}/days/${session.dayId}`);
    ```
  - Delete the old `deleteWorkout` export (superseded by `deleteDay`); grep to confirm no remaining import: `grep -rn "deleteWorkout" src`.
  - Delete the old `createVariation`, `renameVariation`, `deleteVariation` exports **only if** nothing imports them after Step 5 (the new `WeekTabs` replaces `VariationsBar`). Grep first; if `VariationsBar.tsx` is the sole importer and you delete it in Step 6, remove these three too. Otherwise keep them.

- [ ] **Step 2: `WeekTabs` component** — create `src/components/WeekTabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { addWeek, renameWeek, deleteWeek } from "@/app/actions";

/** Week selector for a workout. Links set `?week=<position>`; controls add (copy
 * current forward), rename (program-wide), and delete the selected week. */
export function WeekTabs({
  programId,
  weeks,
  selectedWeek,
  basePath,
}: {
  programId: string;
  weeks: { position: number; name: string }[];
  selectedWeek: number;
  /** Path the tabs link to, e.g. `/workouts/<id>` or `/workouts/<id>/days/<dayId>`. */
  basePath: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const active = weeks.find((w) => w.position === selectedWeek);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {weeks.map((w) => (
          <Link
            key={w.position}
            href={`${basePath}?week=${w.position}`}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              w.position === selectedWeek
                ? "border-lime-400 bg-lime-400/10 font-medium text-lime-400"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {w.name}
          </Link>
        ))}
        <form action={addWeek.bind(null, programId, selectedWeek)}>
          <button
            className="rounded-full border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
            title="Copy the current week forward"
          >
            + Week
          </button>
        </form>
      </div>
      {active && (
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {renaming ? (
            <form
              action={async (fd: FormData) => {
                await renameWeek(programId, selectedWeek, String(fd.get("name") ?? ""));
                setRenaming(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                name="name"
                defaultValue={active.name}
                autoFocus
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none"
              />
              <button className="text-lime-400">Save</button>
            </form>
          ) : (
            <button onClick={() => setRenaming(true)} className="transition hover:text-zinc-300">
              Rename week
            </button>
          )}
          {weeks.length > 1 && (
            <form
              action={deleteWeek.bind(null, programId, selectedWeek)}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Delete "${active.name}" for every day, including its logged sessions? This cannot be undone.`,
                  )
                )
                  e.preventDefault();
              }}
            >
              <button className="transition hover:text-red-400">Delete week</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `DaysList` component** — create `src/components/DaysList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { addDay, renameDay, deleteDay, startSession } from "@/app/actions";
import type { HubDay } from "@/db/queries";

/** Hub list of days for the selected week. Each row: name, a muscle/exercise
 * summary, Start (this day, this week), and a link into the day. Plus rename /
 * delete controls and an "+ Add day" button. */
export function DaysList({
  programId,
  selectedWeek,
  days,
}: {
  programId: string;
  selectedWeek: number;
  days: HubDay[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => (
        <DayRow key={d.id} programId={programId} selectedWeek={selectedWeek} day={d} />
      ))}
      <form action={addDay.bind(null, programId)}>
        <button className="w-full rounded-2xl border border-dashed border-zinc-700 py-4 font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400">
          + Add day
        </button>
      </form>
    </div>
  );
}

function DayRow({
  programId,
  selectedWeek,
  day,
}: {
  programId: string;
  selectedWeek: number;
  day: HubDay;
}) {
  const [renaming, setRenaming] = useState(false);
  const dayHref = `/workouts/${programId}/days/${day.id}?week=${selectedWeek}`;
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
      {renaming ? (
        <form
          action={async (fd: FormData) => {
            await renameDay(day.id, String(fd.get("name") ?? ""));
            setRenaming(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="name"
            defaultValue={day.name}
            autoFocus
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-lime-400 focus:outline-none"
          />
          <button className="text-sm text-lime-400">Save</button>
        </form>
      ) : (
        <Link href={dayHref} className="block">
          <h3 className="text-lg font-semibold tracking-tight">{day.name}</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {day.exerciseCount} exercise{day.exerciseCount === 1 ? "" : "s"}
            {day.sectionSummary && ` · ${day.sectionSummary}`}
          </p>
        </Link>
      )}
      <div className="mt-3 flex items-center gap-2">
        {day.unfinishedSessionId ? (
          <Link
            href={`/sessions/${day.unfinishedSessionId}`}
            className="flex-1 rounded-xl bg-amber-400 py-2 text-center font-bold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98]"
          >
            Resume
          </Link>
        ) : (
          <form action={startSession.bind(null, day.id, day.cellVariationId ?? undefined)} className="flex-1">
            <button
              disabled={!day.cellVariationId}
              className="w-full rounded-xl bg-lime-400 py-2 font-bold text-zinc-950 transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-40"
            >
              Start
            </button>
          </form>
        )}
        <Link
          href={`/workouts/${programId}/days/${day.id}/edit?week=${selectedWeek}`}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
        >
          Edit
        </Link>
        <button
          onClick={() => setRenaming((r) => !r)}
          className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-500 transition hover:text-zinc-300"
          type="button"
        >
          ✎
        </button>
        <form
          action={deleteDay.bind(null, day.id)}
          onSubmit={(e) => {
            if (!confirm(`Delete "${day.name}" and all its weeks and logged sessions? This cannot be undone.`))
              e.preventDefault();
          }}
        >
          <button className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-600 transition hover:text-red-400">
            🗑
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Program hub page** — rewrite `src/app/workouts/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getProgramHub } from "@/db/queries";
import { deleteProgram } from "@/app/actions";
import { WeekTabs } from "@/components/WeekTabs";
import { DaysList } from "@/components/DaysList";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

export default async function WorkoutHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;
  const userId = await requireUserId();
  const weekParam = week != null && week !== "" ? Number(week) : undefined;
  const hub = await getProgramHub(id, userId, Number.isFinite(weekParam) ? weekParam : undefined);
  if (!hub) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/workouts"
          aria-label="Back to workouts"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{hub.program.name}</h1>
          <p className="text-sm text-zinc-400">
            {hub.days.length} day{hub.days.length === 1 ? "" : "s"} · {hub.weeks.length} week
            {hub.weeks.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <WeekTabs
        programId={hub.program.id}
        weeks={hub.weeks}
        selectedWeek={hub.selectedWeek}
        basePath={`/workouts/${hub.program.id}`}
      />

      <DaysList programId={hub.program.id} selectedWeek={hub.selectedWeek} days={hub.days} />

      <form action={deleteProgram.bind(null, hub.program.id)} className="mt-4 text-center">
        <ConfirmSubmit
          message={`Delete the whole "${hub.program.name}" workout — every day, week and session? This cannot be undone.`}
          className="text-sm text-zinc-600 transition hover:text-red-400"
        >
          Delete workout
        </ConfirmSubmit>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Day detail page** — create `src/app/workouts/[id]/days/[dayId]/page.tsx`. This is the old day page, keyed by (dayId, week). It resolves the cell variation for the selected week, renders the plan + that week's history, and uses `WeekTabs` to switch weeks.

```tsx
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import {
  getDayCellVariationId,
  getUnfinishedSession,
  getVariationStructure,
  getWorkoutHistory,
  listDayVariations,
} from "@/db/queries";
import { startSession } from "@/app/actions";
import {
  blockLabel,
  formatClock,
  formatCurrentWeight,
  formatSeconds,
  formatSessionCell,
  formatTarget,
  formatTargetWeight,
} from "@/lib/workout";
import { deriveWeeks } from "@/lib/weeks";
import { WeekTabs } from "@/components/WeekTabs";

export const dynamic = "force-dynamic";

export default async function DayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; dayId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id: programId, dayId } = await params;
  const { week } = await searchParams;
  const userId = await requireUserId();

  // Derive the day's weeks from its variations (kept aligned program-wide).
  const dayVariations = await listDayVariations(dayId, userId);
  if (!dayVariations.length) notFound();
  const weeks = deriveWeeks([dayVariations.map((v) => ({ position: v.position, name: v.name }))]);
  const wanted = week != null && week !== "" ? Number(week) : undefined;
  const selectedWeek =
    wanted != null && weeks.some((w) => w.position === wanted)
      ? wanted
      : weeks[weeks.length - 1].position;

  const cellVariationId = await getDayCellVariationId(dayId, selectedWeek, userId);
  if (!cellVariationId) notFound();
  const [structure, history, unfinished] = await Promise.all([
    getVariationStructure(cellVariationId, userId),
    getWorkoutHistory(dayId),
    getUnfinishedSession(dayId, userId),
  ]);
  if (!structure) notFound();
  const { workout, blocks } = structure;

  // Only this week's sessions (its cell has its own exercise ids).
  const columns = history.sessions.filter((s) => s.variationId === cellVariationId).reverse();
  const exercisesInOrder = blocks.flatMap((b) => b.exercises);
  const groupOf = new Map<string, { size: number; label: string; firstId: string; lastId: string }>();
  for (const b of blocks) {
    for (const e of b.exercises) {
      groupOf.set(e.id, {
        size: b.exercises.length,
        label: blockLabel(b.exercises.length),
        firstId: b.exercises[0].id,
        lastId: b.exercises[b.exercises.length - 1].id,
      });
    }
  }
  const currentWeight = (exerciseId: string): number | null => {
    for (const s of columns.slice().reverse()) {
      const w = (history.logsBySession[s.id] ?? [])
        .filter((l) => l.exerciseId === exerciseId && l.weight != null)
        .at(-1)?.weight;
      if (w != null) return w;
    }
    return null;
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${programId}`}
          aria-label="Back to workout"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{workout.name}</h1>
          <p className="text-sm text-zinc-400">Default rest: {formatSeconds(workout.defaultRestSeconds)}</p>
        </div>
        <Link
          href={`/workouts/${programId}/days/${dayId}/edit?week=${selectedWeek}`}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500"
        >
          Edit
        </Link>
      </header>

      <WeekTabs
        programId={programId}
        weeks={weeks}
        selectedWeek={selectedWeek}
        basePath={`/workouts/${programId}/days/${dayId}`}
      />

      {unfinished ? (
        <Link
          href={`/sessions/${unfinished.id}`}
          className="rounded-2xl bg-amber-400 py-3.5 text-center font-bold text-zinc-950 shadow-lg shadow-amber-400/15 transition hover:bg-amber-300 active:scale-[0.98]"
        >
          Resume session in progress
        </Link>
      ) : (
        <form action={startSession.bind(null, dayId, cellVariationId)}>
          <button className="w-full rounded-2xl bg-lime-400 py-3.5 font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98]">
            Start workout
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Plan</h2>
        <div className="flex flex-col gap-3">
          {blocks.map((block, i) => {
            const section = block.exercises[0]?.sectionName ?? null;
            const prevSection = i > 0 ? (blocks[i - 1].exercises[0]?.sectionName ?? null) : null;
            const showHeader = section && section !== prevSection;
            return (
              <div key={block.id} className="flex flex-col gap-1">
                {showHeader && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">
                    {section}
                  </p>
                )}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4">
                  {block.exercises.length > 1 && (
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      {blockLabel(block.exercises.length)}
                    </p>
                  )}
                  {block.exercises.map((e) => (
                    <div key={e.id} className="flex items-baseline justify-between gap-3 py-1">
                      <span className="font-medium">{e.name}</span>
                      <span className="whitespace-nowrap text-sm text-zinc-400">
                        {formatTarget(e)}
                        {e.targetWeight != null && ` · ${formatTargetWeight(e)}`}
                        {e.restOverrideSeconds != null && ` · rest ${formatSeconds(e.restOverrideSeconds)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {blocks.length === 0 && (
            <p className="text-sm text-zinc-500">No exercises yet — hit Edit to add some.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">History</h2>
        {columns.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No finished sessions in this week yet. Your logged sets will show up here, one column per
            session.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-zinc-400">
                  <th className="px-3 py-2.5 font-medium">Exercise</th>
                  <th className="px-3 py-2.5 font-medium">Target</th>
                  <th className="px-3 py-2.5 font-medium">Weight</th>
                  {columns.map((s) => {
                    const durationSeconds = s.finishedAt
                      ? (s.finishedAt.getTime() - s.startedAt.getTime()) / 1000
                      : 0;
                    return (
                      <th key={s.id} className="px-3 py-2 font-medium align-top">
                        <Link href={`/sessions/${s.id}`} className="block transition hover:text-lime-400">
                          {s.startedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          <span className="block text-[11px] font-normal tabular-nums text-zinc-500">
                            {durationSeconds > 0 ? formatClock(durationSeconds) : "—"}
                          </span>
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {exercisesInOrder.map((e, idx) => {
                  const group = groupOf.get(e.id);
                  const grouped = (group?.size ?? 1) > 1;
                  const section = e.sectionName ?? null;
                  const prevSection = idx > 0 ? (exercisesInOrder[idx - 1].sectionName ?? null) : null;
                  const showSection = section && section !== prevSection;
                  return (
                    <Fragment key={e.id}>
                      {showSection && (
                        <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                          <td
                            colSpan={3 + columns.length}
                            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
                          >
                            {section}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-zinc-800/60 last:border-0 even:bg-zinc-900/30">
                        <td className={`px-3 py-2.5 font-medium ${grouped ? "border-l-2 border-lime-400/50" : ""}`}>
                          {e.name}
                          {grouped && group?.firstId === e.id && (
                            <span className="ml-2 rounded bg-lime-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-400/80">
                              {group.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400">{formatTarget(e)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                          {formatCurrentWeight(currentWeight(e.id), e.weightUnit)}
                        </td>
                        {columns.map((s) => {
                          const logs = (history.logsBySession[s.id] ?? []).filter((l) => l.exerciseId === e.id);
                          const note = (history.notesBySession[s.id] ?? []).find((n) => n.exerciseId === e.id)?.note;
                          return (
                            <td key={s.id} className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                              {formatSessionCell(logs, e.weightUnit, currentWeight(e.id))}
                              {note && (
                                <span title={note} className="ml-0.5 cursor-help text-lime-400">
                                  *
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Cell edit page** — create `src/app/workouts/[id]/days/[dayId]/edit/page.tsx`, then delete the old `src/app/workouts/[id]/edit/page.tsx`.

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getDayCellVariationId, getVariationStructure, listDayVariations } from "@/db/queries";
import { deriveWeeks } from "@/lib/weeks";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";
import { WeekTabs } from "@/components/WeekTabs";

export const dynamic = "force-dynamic";

export default async function EditCellPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; dayId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id: programId, dayId } = await params;
  const { week } = await searchParams;
  const userId = await requireUserId();

  const dayVariations = await listDayVariations(dayId, userId);
  if (!dayVariations.length) notFound();
  const weeks = deriveWeeks([dayVariations.map((v) => ({ position: v.position, name: v.name }))]);
  const wanted = week != null && week !== "" ? Number(week) : undefined;
  const selectedWeek =
    wanted != null && weeks.some((w) => w.position === wanted) ? wanted : weeks[weeks.length - 1].position;

  const cellVariationId = await getDayCellVariationId(dayId, selectedWeek, userId);
  if (!cellVariationId) notFound();
  const structure = await getVariationStructure(cellVariationId, userId);
  if (!structure) notFound();
  const { workout, blocks } = structure;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${programId}/days/${dayId}?week=${selectedWeek}`}
          aria-label="Back to day"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Edit day</h1>
          <p className="truncate text-sm text-zinc-400">
            {workout.name} · <span className="text-lime-400">{weeks.find((w) => w.position === selectedWeek)?.name}</span>
          </p>
        </div>
      </header>

      <WeekTabs
        programId={programId}
        weeks={weeks}
        selectedWeek={selectedWeek}
        basePath={`/workouts/${programId}/days/${dayId}/edit`}
      />

      <WorkoutBuilder
        variationId={cellVariationId}
        initial={{
          name: workout.name,
          defaultRestSeconds: workout.defaultRestSeconds,
          blocks: blocks.map((b) => ({
            id: b.id,
            sectionName: b.exercises[0]?.sectionName ?? null,
            exercises: b.exercises.map((e) => ({
              id: e.id,
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
          })),
        }}
      />
    </main>
  );
}
```

Then: `git rm src/app/workouts/[id]/edit/page.tsx`.

- [ ] **Step 7: Workouts list → programs** — rewrite `src/app/workouts/page.tsx`:

```tsx
import Link from "next/link";
import { requireUserId, signOut } from "@/auth";
import { listPrograms } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const userId = await requireUserId();
  const workouts = await listPrograms(userId);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-400">🏋️ Gym Bro</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Workouts</h1>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="text-sm text-zinc-500 transition hover:text-zinc-300">Sign out</button>
        </form>
      </header>

      {workouts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          <p className="text-3xl">💪</p>
          <p className="mt-3 font-semibold text-zinc-200">No workouts yet</p>
          <p className="mt-1 text-sm">Create your first plan — days, weeks, exercises.</p>
        </div>
      )}

      {workouts.map((w) => (
        <div
          key={w.id}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 transition hover:border-zinc-700"
        >
          <Link href={`/workouts/${w.id}`} className="block">
            <h2 className="text-xl font-semibold tracking-tight">{w.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {w.dayCount} day{w.dayCount === 1 ? "" : "s"}
              {w.lastFinishedAt &&
                ` · last done ${w.lastFinishedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </p>
          </Link>
          <div className="mt-4 flex gap-2">
            {w.unfinishedSessionId ? (
              <Link
                href={`/sessions/${w.unfinishedSessionId}`}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-center font-bold text-zinc-950 shadow-lg shadow-amber-400/15 transition hover:bg-amber-300 active:scale-[0.98]"
              >
                Resume session
              </Link>
            ) : (
              <Link
                href={`/workouts/${w.id}`}
                className="flex-1 rounded-xl bg-lime-400 py-2.5 text-center font-bold text-zinc-950 shadow-lg shadow-lime-400/15 transition hover:bg-lime-300 active:scale-[0.98]"
              >
                Open
              </Link>
            )}
            <Link
              href={`/workouts/${w.id}`}
              className="rounded-xl border border-zinc-700 px-4 py-2.5 text-zinc-300 transition hover:border-zinc-500"
            >
              Days
            </Link>
          </div>
        </div>
      ))}

      <Link
        href="/workouts/new"
        className="rounded-2xl border border-dashed border-zinc-700 py-4 text-center font-medium text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
      >
        + New workout
      </Link>

      <div className="flex justify-center gap-5 text-sm text-zinc-600">
        <Link href="/import" className="transition hover:text-zinc-300">
          Import spreadsheet
        </Link>
        <a href="/api/export" className="transition hover:text-zinc-300">
          Export CSV
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Session back-links** — update the two links that point at the old day route so they land on day detail (they only have `dayId`, so route through a lightweight resolver on the day-detail page is not possible; instead pass the program id).

  In `src/db/queries.ts`, `getSessionData`'s `structure.workout` already carries `programId` (Task 2). In `src/app/sessions/[id]/page.tsx` line ~55, change:
  ```tsx
  href={`/workouts/${structure.workout.programId}/days/${structure.workout.id}`}
  ```
  In `src/components/SessionRunner.tsx`, the component receives `workoutId`. Add a `programId` prop and use it. At line ~191 change the link to:
  ```tsx
  href={`/workouts/${programId}/days/${workoutId}`}
  ```
  Find where `SessionRunner` is rendered (`src/app/sessions/[id]/page.tsx`) and pass `programId={structure.workout.programId}`. Add `programId: string;` to `SessionRunner`'s props type and destructure it.

- [ ] **Step 9: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS; `grep -rn "deleteWorkout\|VariationsBar\|/workouts/\${.*}?v=" src` returns nothing (all old day-route usages gone). If `VariationsBar.tsx` is now unused, `git rm src/components/VariationsBar.tsx` and remove `createVariation/renameVariation/deleteVariation` from `actions.ts` if unreferenced.

```bash
git add -A
git commit -m "feat: program hub, day detail, cell edit — weeks × days navigation"
```

---

### Task 5: Verify + deploy

- [ ] **Step 1:** `npm test && npx tsc --noEmit && npm run lint && npm run build` all green.
- [ ] **Step 2:** Controller runtime check on the deployed HTTPS URL: create a Workout (build Day 1) → hub shows Day 1 / Week 1 → **+ Add day** → **+ Week** (copies both days forward) → open Day 1, switch to Week 2, **Edit** the cell, change a target, save → **Start** Day 1 Week 2, log a set, finish → confirm the history grid shows it under Week 2 and Week 1 is untouched → reopen and confirm the grid stays rectangular. Clean up the test workout.
- [ ] **Step 3:** `vercel deploy --prod --yes`; verify live.
