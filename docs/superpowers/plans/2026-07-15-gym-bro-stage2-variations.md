# Gym Bro Stage 2: Variations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Surface variations in the UI — a day can hold several named variations; you create them by copying an existing one, pick which one you're viewing/editing/training, and each past session is labeled with its variation.

**Architecture:** Threads an explicit `variationId` through the view/edit/train/history paths (today everything implicitly used a day's single "Base" variation). The workout-detail page gains a **variations bar** and resolves the "active" variation from a `?v=<id>` search param (default: last-used, else first). Exercises are edited per-variation; the day still owns the shared name + rest.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-gym-bro-programs-variations-design.md` (Stage 2).

## Global Constraints

- Model unchanged from Stage 1 (programs/days/variations/flat-exercises). This stage only adds queries/actions/UI. No schema migration.
- A day always has ≥1 variation; deleting the last is blocked.
- New variations are created by **copying** an existing variation's exercises (name, sets, unit, superset grouping, rep scheme/reps, note, targetWeight, and a FRESH `lineageId` per copied exercise so history aligns).
- The day owns the shared `name` + `defaultRestSeconds`; a variation owns its exercise list. Editing a variation via the builder updates the day's name/rest AND that variation's exercises.
- `day.id` still equals the old workout id; routes stay `/workouts/[id]` where `[id]` is the day id. The active variation is a `?v=<variationId>` query param.
- Ownership on every new query/action via the `variation → day → program.userId` chain.
- Verification: `npm test`, `npx tsc --noEmit`, `npm run lint` pass before every commit. Dev server is controller-owned (port 3000) — do not start another. Commit every task.
- Card/pill styling matches the app (dark, `rounded-2xl`/`rounded-full`, lime accent for active).

## File structure

- `src/db/queries.ts` — add `listDayVariations`, `getVariationStructure`; `getWorkoutStructure` delegates to the day's first variation; `getWorkoutHistory` adds `variationNameBySession`; `getSessionData` builds from `session.variationId`.
- `src/app/actions.ts` — add `createVariation`, `renameVariation`, `deleteVariation`; `startSession(dayId, variationId)`; rename `updateWorkout` → `updateVariation(variationId, input)`.
- `src/components/VariationsBar.tsx` — new client component (pills + add/rename/delete).
- `src/app/workouts/[id]/page.tsx` — resolve active variation, render the bar, wire Plan/Start/Edit/History to it.
- `src/app/workouts/[id]/edit/page.tsx` + `src/components/WorkoutBuilder.tsx` — thread `variationId`; save calls `updateVariation`.
- `src/app/sessions/[id]/page.tsx` — pass the session's variation name into the runner header (optional label).

---

### Task 1: Queries — variations, per-variation structure, history labels, session-by-variation

**Files:** Modify `src/db/queries.ts`

**Interfaces (Produces):**
- `listDayVariations(dayId, userId): Promise<Variation[]>` — ordered by position; `[]` if not owned.
- `getVariationStructure(variationId, userId): Promise<(WorkoutStructure & { variation: Variation }) | null>` — the variation's exercises grouped into blocks + the compat `workout` (day) + the variation row.
- `getWorkoutStructure(dayId, userId)` — unchanged signature; now returns the day's FIRST variation's structure (delegates to `getVariationStructure`).
- `WorkoutHistory` gains `variationNameBySession: Record<string, string>`.
- `getSessionData` — `structure` is built from `session.variationId` (not the day's first variation).

- [ ] **Step 1: Add `listDayVariations` and `getVariationStructure`; refactor `getWorkoutStructure`**

Add `Variation` to the schema type import. Replace the current `dayView`/`getWorkoutStructure` region with:

```ts
import type { Block, Exercise, Session, SessionNote, SetLog, Variation, Workout } from "@/db/schema";

async function ownedDayWorkout(dayId: string, userId: string): Promise<Workout | null> {
  const db = await getDb();
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  if (!day) return null;
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, day.programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  return {
    id: day.id,
    userId: program.userId,
    name: day.name,
    defaultRestSeconds: day.defaultRestSeconds,
    createdAt: program.createdAt,
  };
}

export async function listDayVariations(dayId: string, userId: string): Promise<Variation[]> {
  const db = await getDb();
  const workout = await ownedDayWorkout(dayId, userId);
  if (!workout) return [];
  return db.query.variations.findMany({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
}

export async function getVariationStructure(
  variationId: string,
  userId: string,
): Promise<(WorkoutStructure & { variation: Variation }) | null> {
  const db = await getDb();
  const variation = await db.query.variations.findFirst({
    where: eq(schema.variations.id, variationId),
  });
  if (!variation) return null;
  const workout = await ownedDayWorkout(variation.dayId, userId);
  if (!workout) return null;
  const exercises = await db.query.exercises.findMany({
    where: eq(schema.exercises.variationId, variationId),
    orderBy: asc(schema.exercises.position),
  });
  const blocks = groupExercisesIntoBlocks(exercises).map((g, i) => ({
    id: g.key,
    position: i,
    exercises: g.exercises,
  }));
  return { workout, blocks, variation };
}

export async function getWorkoutStructure(
  dayId: string,
  userId: string,
): Promise<WorkoutStructure | null> {
  const db = await getDb();
  const first = await db.query.variations.findFirst({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
  if (first) return getVariationStructure(first.id, userId);
  const workout = await ownedDayWorkout(dayId, userId);
  return workout ? { workout, blocks: [] } : null;
}
```

- [ ] **Step 2: History variation labels + session-by-variation structure**

In `getWorkoutHistory`, after fetching `finished`, fetch the variations for those sessions and build the name map; add it to the return:

```ts
  const variationIds = [...new Set(finished.map((s) => s.variationId))];
  const vars = variationIds.length
    ? await db.query.variations.findMany({ where: inArray(schema.variations.id, variationIds) })
    : [];
  const nameById = new Map(vars.map((v) => [v.id, v.name]));
  const variationNameBySession: Record<string, string> = {};
  for (const s of finished) variationNameBySession[s.id] = nameById.get(s.variationId) ?? "";
```

Add `variationNameBySession` to the `WorkoutHistory` type and the return object.

In `getSessionData`, change the structure line from `getWorkoutStructure(session.dayId, userId)` to:

```ts
  const structure = await getVariationStructure(session.variationId, userId);
```

(The `SessionData.structure` type is `WorkoutStructure`; `getVariationStructure` returns that plus `variation` — assign it; the extra field is compatible. If tsc objects, type `structure` as `WorkoutStructure` by destructuring: `const vstruct = await getVariationStructure(...); ... structure: vstruct` — `WorkoutStructure & {variation}` is assignable to `WorkoutStructure`.)

- [ ] **Step 3: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint` (queries.ts has no unit tests; ensure the pure suite still passes and types are clean).
Commit: `git add src/db/queries.ts && git commit -m "feat: variation-aware queries (list, per-variation structure, history labels)"`

---

### Task 2: Actions — create/rename/delete variation; variation-aware start & update

**Files:** Modify `src/app/actions.ts`, `src/components/WorkoutBuilder.tsx`

**Interfaces (Produces):**
- `createVariation(dayId: string, sourceVariationId: string): Promise<void>` — copies the source's exercises into a new variation named `"<source> copy"`; redirects to `/workouts/${dayId}?v=${newId}`.
- `renameVariation(variationId: string, name: string): Promise<void>`.
- `deleteVariation(variationId: string): Promise<void>` — throws/redirects; blocked if it's the day's last variation.
- `startSession(dayId: string, variationId: string)` — session now records `variationId`.
- `updateVariation(variationId: string, input: WorkoutInput)` (renamed from `updateWorkout`) — updates the variation's day (name/rest) + that variation's exercises.
- `WorkoutBuilder` prop `variationId?` (renamed from `workoutId?`); save calls `updateVariation`.

- [ ] **Step 1: Add variation ownership helper + the three variation actions**

Add near `ownedDay`:

```ts
async function ownedVariation(variationId: string, userId: string) {
  const db = await getDb();
  const v = await db.query.variations.findFirst({ where: eq(schema.variations.id, variationId) });
  if (!v) throw new Error("Variation not found");
  await ownedDay(v.dayId, userId); // throws if not owned
  return v;
}

export async function createVariation(dayId: string, sourceVariationId: string) {
  const userId = await requireUserId();
  await ownedDay(dayId, userId);
  const source = await ownedVariation(sourceVariationId, userId);
  const db = await getDb();
  const siblings = await db.query.variations.findMany({ where: eq(schema.variations.dayId, dayId) });
  const sourceExercises = await db.query.exercises.findMany({
    where: eq(schema.exercises.variationId, sourceVariationId),
    orderBy: asc(schema.exercises.position),
  });
  let newId = "";
  await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.variations)
      .values({ dayId, position: siblings.length, name: `${source.name} copy`.slice(0, 60) })
      .returning({ id: schema.variations.id });
    newId = v.id;
    if (sourceExercises.length) {
      await tx.insert(schema.exercises).values(
        sourceExercises.map((e) => ({
          variationId: v.id,
          position: e.position,
          lineageId: crypto.randomUUID(), // fresh: a copy is a new lineage until user aligns it
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
  });
  revalidatePath(`/workouts/${dayId}`);
  redirect(`/workouts/${dayId}?v=${newId}`);
}

export async function renameVariation(variationId: string, name: string) {
  const userId = await requireUserId();
  const v = await ownedVariation(variationId, userId);
  const db = await getDb();
  await db
    .update(schema.variations)
    .set({ name: name.trim().slice(0, 60) || "Variation" })
    .where(eq(schema.variations.id, variationId));
  revalidatePath(`/workouts/${v.dayId}`);
}

export async function deleteVariation(variationId: string) {
  const userId = await requireUserId();
  const v = await ownedVariation(variationId, userId);
  const db = await getDb();
  const siblings = await db.query.variations.findMany({ where: eq(schema.variations.dayId, v.dayId) });
  if (siblings.length <= 1) throw new Error("A day needs at least one variation");
  await db.delete(schema.variations).where(eq(schema.variations.id, variationId));
  revalidatePath(`/workouts/${v.dayId}`);
  redirect(`/workouts/${v.dayId}`);
}
```

**Note on copy lineage:** the plan uses a fresh `lineageId` per copied exercise. This means a brand-new variation's exercises do NOT yet share a history row with the source in the grid. That is acceptable for Stage 2 (variations still label their own sessions); Stage 3's history work decides whether copies should inherit lineage. Implement as written; do not invent lineage-sharing here.

- [ ] **Step 2: Variation-aware `startSession` and `updateVariation`**

Change `startSession` to take an OPTIONAL variationId (so the `/workouts` list
page's `startSession.bind(null, w.id)` keeps working — it defaults to the
last-used variation, else the day's first):

```ts
export async function startSession(dayId: string, variationId?: string) {
  const userId = await requireUserId();
  await ownedDay(dayId, userId);
  const db = await getDb();
  let vId = variationId;
  if (vId) {
    const v = await ownedVariation(vId, userId);
    if (v.dayId !== dayId) throw new Error("Variation does not belong to this day");
  } else {
    // Default: the most recently used variation for this day, else the first.
    const lastSession = await db.query.sessions.findFirst({
      where: eq(schema.sessions.dayId, dayId),
      orderBy: desc(schema.sessions.startedAt),
    });
    vId =
      lastSession?.variationId ??
      (await db.query.variations.findFirst({
        where: eq(schema.variations.dayId, dayId),
        orderBy: asc(schema.variations.position),
      }))?.id;
    if (!vId) throw new Error("Day has no variation");
  }
  const [session] = await db
    .insert(schema.sessions)
    .values({ dayId, variationId: vId, userId })
    .returning({ id: schema.sessions.id });
  redirect(`/sessions/${session.id}`);
}
```

Add `asc` and `desc` to the `drizzle-orm` import in `actions.ts` if not present.

Rename `updateWorkout` → `updateVariation(variationId, input)`. Its body: resolve the variation (ownership) → get its `dayId` → update the DAY's name/rest → do the existing in-place exercise diff against `schema.exercises` where `variationId = variationId` (replace every `eq(schema.exercises.variationId, <baseVariationId>)` / the `baseVariationId(dayId)` lookup with the passed `variationId`; update `schema.days` for name/rest using the variation's dayId). Redirect to `/workouts/${dayId}?v=${variationId}`. Keep `createWorkout`/`deleteWorkout` as they are (a created workout still makes the day + first variation; delete removes the whole day).

- [ ] **Step 3: WorkoutBuilder prop rename**

In `src/components/WorkoutBuilder.tsx`: rename the prop `workoutId` → `variationId` throughout; the save path calls `updateVariation(variationId, payload)` when `variationId` is set, else `createWorkout(payload)`. Update the import from `@/app/actions` (`updateWorkout` → `updateVariation`).

- [ ] **Step 4: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint` — expect errors only in the pages that call `startSession`/`updateWorkout`/pass `workoutId` (Tasks 3–4 fix them). If tsc is red only there, that's expected; land this with Task 3. Otherwise commit now:
`git add src/app/actions.ts src/components/WorkoutBuilder.tsx && git commit -m "feat: variation create/rename/delete + variation-aware start/update"`
(If tsc is red due to Task 3/4 call sites, DO NOT commit alone — note it and commit at end of Task 4.)

---

### Task 3: Variations bar + workout-detail wiring

**Files:** Create `src/components/VariationsBar.tsx`; modify `src/app/workouts/[id]/page.tsx`

**Interfaces:**
- Consumes Task 1 (`listDayVariations`, `getVariationStructure`, history labels) + Task 2 actions.
- Produces: `VariationsBar` client component `{ dayId, variations: {id,name}[], activeId }`.

- [ ] **Step 1: `VariationsBar` component**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { createVariation, deleteVariation, renameVariation } from "@/app/actions";

export function VariationsBar({
  dayId,
  variations,
  activeId,
}: {
  dayId: string;
  variations: { id: string; name: string }[];
  activeId: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const active = variations.find((v) => v.id === activeId);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {variations.map((v) => (
          <Link
            key={v.id}
            href={`/workouts/${dayId}?v=${v.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              v.id === activeId
                ? "border-lime-400 bg-lime-400/10 font-medium text-lime-400"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {v.name}
          </Link>
        ))}
        <form action={createVariation.bind(null, dayId, activeId)}>
          <button
            className="rounded-full border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-lime-400 hover:text-lime-400"
            title="Duplicate the current variation"
          >
            + Variation
          </button>
        </form>
      </div>
      {active && (
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {renaming ? (
            <form
              action={async (fd: FormData) => {
                await renameVariation(active.id, String(fd.get("name") ?? ""));
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
              Rename
            </button>
          )}
          {variations.length > 1 && (
            <form
              action={deleteVariation.bind(null, active.id)}
              onSubmit={(e) => {
                if (!confirm(`Delete variation "${active.name}"?`)) e.preventDefault();
              }}
            >
              <button className="transition hover:text-red-400">Delete</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the workout-detail page**

In `src/app/workouts/[id]/page.tsx`:
- Accept `searchParams`: `{ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{ v?: string }> }`. `const { v } = await searchParams;`
- Fetch `const variations = await listDayVariations(id, userId);` and resolve the active id: `v` if it's among `variations`, else the last-used (most recent session's variation — from `history.sessions[0]?.variationId` if present) else `variations[0]?.id`.
- Build the structure from the active variation: `const structure = await getVariationStructure(activeId, userId)` (replace the `getWorkoutStructure` call). Keep `getWorkoutHistory(id)` and `getUnfinishedSession(id, userId)`.
- Render `<VariationsBar dayId={id} variations={variations.map((v)=>({id:v.id,name:v.name}))} activeId={activeId} />` just under the header (only when `variations.length > 0`).
- Change the **Start** form to `action={startSession.bind(null, id, activeId)}`.
- Change the **Edit** link to `href={`/workouts/${id}/edit?v=${activeId}`}`.
- In the history table header, under the date + duration, add the variation label: `history.variationNameBySession[s.id]` in small muted text.

- [ ] **Step 3: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint`.
Commit (with Task 2 if it was held): `git add -A && git commit -m "feat: variations bar and variation-aware workout detail"`

---

### Task 4: Edit page + builder threading

**Files:** Modify `src/app/workouts/[id]/edit/page.tsx`

- [ ] **Step 1: Thread the variation through edit**

In `edit/page.tsx`: accept `searchParams: Promise<{ v?: string }>`; resolve the variation id (`v` else the day's first variation via `listDayVariations`); call `getVariationStructure(variationId, userId)` instead of `getWorkoutStructure`; pass `variationId={variation.id}` to `WorkoutBuilder` (was `workoutId={workout.id}`). The back-link stays `/workouts/${workout.id}?v=${variationId}`.

- [ ] **Step 2: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint`.
Commit: `git add -A && git commit -m "feat: edit a specific variation"`

---

### Task 5: End-to-end verification

**Files:** none

- [ ] **Step 1: Static gates**

`npm test && npx tsc --noEmit && npm run lint && npm run build` — all green.

- [ ] **Step 2: Authenticated runtime (controller drives)**

On the migrated dev DB, sign in and confirm:
1. A day shows its variations bar with "Base" active; the Plan renders Base's exercises.
2. "+ Variation" duplicates Base → new "Base copy" active, same exercises; rename it to "Week 2"; the Plan still renders it.
3. Edit "Week 2": change a weight/reps/exercise — saves to that variation only; "Base" is unchanged when you switch back.
4. Start "Week 2" → the runner shows Week 2's exercises; log a set, finish.
5. History grid: the new session's column is labeled "Week 2"; older ones "Base".
6. Delete "Week 2" (allowed, ≥2 exist); deleting the last remaining variation is blocked.

- [ ] **Step 3: Commit any fixes**

`git add -A && git commit -m "fix: stage 2 polish from verification"` (only if needed).
