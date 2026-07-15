# Gym Bro Stage 1: Model + Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `workout → block → exercise` data model with `program → day → variation → flat exercise` (plus `hit_target` on set logs), migrate all existing data with no loss, and rewire every read/write path so the app looks and behaves exactly as it does today.

**Architecture:** The UI, `buildSteps`, and page components stay untouched by keeping the query layer's return shapes identical (`WorkoutStructure { workout, blocks }`). Under the hood, a "workout" in the UI now maps to a **Day + its single "Base" variation**, and "blocks" are reconstructed from the flat exercise list by grouping consecutive exercises that share a `superset_key`. All churn is concentrated in `schema.ts`, one hand-written data-preserving migration, `queries.ts`, and `actions.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (PGlite dev at `./.pglite`, Postgres prod), next-auth v5, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-gym-bro-programs-variations-design.md` (Stage 1 only; stages 2–5 are separate plans).

## Global Constraints

- This stage is invisible to the user: after it, the app must behave **exactly as before** (same workout list, builder, runner, history, import, export). It only changes the storage model. No new UI.
- One `program` + one `day` + one `variation` ("Base") per pre-existing workout. `day.id` MUST equal the old `workout.id` so existing routes (`/workouts/[id]`), session links, and `sessions.workout_id → day_id` mapping stay valid.
- Migration is **data-preserving**: every existing exercise, session, set log, and session note survives with its id intact.
- `superset_key`: consecutive exercises sharing a non-null key form a superset/triset (replaces the `blocks` table). Migration derives it from the old `block_id`.
- `lineage_id`: a stable id per exercise used later to align exercises across variations; migration gives each existing exercise a fresh one.
- `target_weight`: nullable `real`; `null` = bodyweight / unknown. New column, not populated by migration.
- Weight-unit values stay exactly `"kg"` and `"bricks"`. The `set_logs` weight column keeps its historical DB name `weight_kg`.
- Verification commands: `npm test`, `npx tsc --noEmit`, `npm run lint` — all must pass before every commit. The dev server (controller-owned, port 3000) is used for runtime checks; do NOT start a second one.
- Path alias `@/*` → `src/*`. Do not add dependencies.

## File structure

- `src/lib/workout.ts` — add `groupExercisesIntoBlocks()` (pure, the compat primitive). buildSteps unchanged.
- `src/db/schema.ts` — new `programs`/`days`/`variations` tables; `exercises` repointed + new columns; `sessions` repointed; `set_logs` gains `hit_target`; `workouts`/`blocks` removed; types kept/redefined so consumers don't change.
- `drizzle/0002_stage1_*.sql` + `drizzle/meta/*` — the data-preserving migration.
- `src/db/queries.ts` — same exported types/signatures, internals read new tables.
- `src/app/actions.ts` — structure + session mutations write new tables; same exported signatures.
- `src/lib/import.ts` / import write path in `actions.ts` — `importSpreadsheet` rewritten to create program/day/variation so it compiles and still works (full import redesign is Stage 5).
- Pages/components (`app/workouts/*`, `app/sessions/*`, `components/*`) — untouched except where they read `session.workoutId` (becomes `session.dayId`).

---

### Task 1: `groupExercisesIntoBlocks` helper (TDD)

The compatibility primitive: turn a flat, ordered exercise list into the block-grouped shape the UI already expects, grouping consecutive exercises that share a `supersetKey`.

**Files:**
- Modify: `src/lib/workout.ts`
- Test: `src/lib/workout.test.ts`

**Interfaces:**
- Produces: `groupExercisesIntoBlocks<T extends { supersetKey: string | null }>(exercises: T[]): { key: string; exercises: T[] }[]` — consecutive items with the same non-null `supersetKey` share a group; a `null` key (or a different key) starts a new group. Order preserved.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/workout.test.ts`:

```ts
import { groupExercisesIntoBlocks } from "./workout";

describe("groupExercisesIntoBlocks", () => {
  const ex = (id: string, supersetKey: string | null) => ({ id, supersetKey });

  it("keeps standalone exercises (null key) in their own group", () => {
    const groups = groupExercisesIntoBlocks([ex("a", null), ex("b", null)]);
    expect(groups.map((g) => g.exercises.map((e) => e.id))).toEqual([["a"], ["b"]]);
  });

  it("groups consecutive exercises sharing a key", () => {
    const groups = groupExercisesIntoBlocks([
      ex("a", null),
      ex("b", "k1"),
      ex("c", "k1"),
      ex("d", null),
    ]);
    expect(groups.map((g) => g.exercises.map((e) => e.id))).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("does not merge non-adjacent groups with the same key", () => {
    const groups = groupExercisesIntoBlocks([ex("a", "k1"), ex("b", null), ex("c", "k1")]);
    expect(groups.map((g) => g.exercises.map((e) => e.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("returns [] for empty input", () => {
    expect(groupExercisesIntoBlocks([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `groupExercisesIntoBlocks` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/workout.ts`:

```ts
/**
 * Group a flat, ordered exercise list into superset blocks: consecutive
 * exercises sharing the same non-null `supersetKey` become one group; a null
 * key (or a change of key) starts a new group. Order is preserved.
 */
export function groupExercisesIntoBlocks<T extends { supersetKey: string | null }>(
  exercises: T[],
): { key: string; exercises: T[] }[] {
  const groups: { key: string; exercises: T[] }[] = [];
  for (const [i, e] of exercises.entries()) {
    const last = groups.at(-1);
    const sameBlock = last && e.supersetKey != null && last.key === e.supersetKey;
    if (sameBlock) last.exercises.push(e);
    else groups.push({ key: e.supersetKey ?? `solo-${i}`, exercises: [e] });
  }
  return groups;
}
```

- [ ] **Step 4: Verify green**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout.ts src/lib/workout.test.ts
git commit -m "feat: groupExercisesIntoBlocks helper for the flat exercise model"
```

---

### Task 2: New schema definitions + compatibility types

Rewrite `src/db/schema.ts` to the new model. Keep the exported type NAMES (`Workout`, `Block`, `Exercise`, `Session`, `SetLog`, `SessionNote`) so `queries.ts`, `actions.ts`, and pages keep compiling; `Workout` and `Block` become explicit types (their tables are gone) populated by the query layer.

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces (tables): `programs`, `days`, `variations`; repointed `exercises` (now `variationId`, `lineageId`, `sectionName`, `supersetKey`, `targetWeight`, no `blockId`); repointed `sessions` (`dayId`, `variationId`, no `workoutId`); `setLogs` gains `hitTarget`.
- Produces (types): `Program`, `Day`, `Variation`, `Exercise`, `Session`, `SetLog`, `SessionNote` from `$inferSelect`; plus explicit `Workout = { id: string; userId: string; name: string; defaultRestSeconds: number; createdAt: Date }` and `Block = { id: string; position: number }` for the compat layer.

- [ ] **Step 1: Replace the tables after `users`**

In `src/db/schema.ts`, remove the `workouts` and `blocks` table declarations and replace with:

```ts
export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const days = pgTable("days", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  defaultRestSeconds: integer("default_rest_seconds").notNull().default(90),
});

export const variations = pgTable("variations", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Repoint `exercises`**

Replace the `exercises` table with (note `blockId` → `variationId`, plus the four new columns):

```ts
export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  variationId: uuid("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  lineageId: uuid("lineage_id").notNull(),
  sectionName: text("section_name"),
  supersetKey: text("superset_key"),
  name: text("name").notNull(),
  sets: integer("sets").notNull(),
  measurement: text("measurement").$type<Measurement>().notNull(),
  repScheme: text("rep_scheme").$type<RepScheme>(),
  repsMin: integer("reps_min"),
  repsMax: integer("reps_max"),
  timeSeconds: integer("time_seconds"),
  restOverrideSeconds: integer("rest_override_seconds"),
  note: text("note"),
  weightUnit: text("weight_unit").$type<WeightUnit>().notNull().default("kg"),
  targetWeight: real("target_weight"),
});
```

- [ ] **Step 3: Repoint `sessions` and extend `set_logs`**

Replace `sessions` with:

```ts
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  variationId: uuid("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
```

In `setLogs`, add after `timeSeconds`:

```ts
    hitTarget: boolean("hit_target").notNull().default(false),
```

and add `boolean` to the `drizzle-orm/pg-core` import at the top.

- [ ] **Step 4: Update the type exports**

Replace the type-export block at the bottom with:

```ts
export type Program = typeof programs.$inferSelect;
export type Day = typeof days.$inferSelect;
export type Variation = typeof variations.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type SessionNote = typeof sessionNotes.$inferSelect;

// Compat shapes the query layer synthesizes so the existing UI is unchanged.
// A "workout" in the UI is a Day + its Base variation; a "block" is a run of
// exercises sharing a superset_key.
export type Workout = {
  id: string; // = day.id
  userId: string;
  name: string;
  defaultRestSeconds: number;
  createdAt: Date;
};
export type Block = { id: string; position: number };
```

- [ ] **Step 5: Verify types compile (schema only)**

Run: `npx tsc --noEmit` — expect errors ONLY in `queries.ts` / `actions.ts` / import (they still reference old columns). That's expected; Tasks 3–6 fix them. Do NOT run the full app yet.

Do not commit yet. The new schema breaks every consumer until Tasks 4–6 rewire them, so schema, migration, queries, and actions all land in **one** commit at the end of Task 6. Leave changes in the working tree and proceed to Task 3.

---

### Task 3: Data-preserving migration

Author the migration by hand (drizzle-kit's auto-diff would drop columns and destroy data). It creates the new tables, adds nullable columns, backfills one program/day/variation per workout, then enforces constraints and drops the old tables.

**Files:**
- Create: `drizzle/0002_stage1_programs.sql`
- Modify: `drizzle/meta/_journal.json` (add the 0002 entry)
- Create: `drizzle/meta/0002_snapshot.json` (see Step 3)

**Interfaces:**
- Consumes: the new `schema.ts` (Task 2).
- Produces: a migration that `migrate()` applies on boot (PGlite) and `drizzle-kit migrate` applies (Postgres).

- [ ] **Step 1: Scaffold the migration + snapshot via drizzle-kit**

Run: `npx drizzle-kit generate --custom --name=stage1_programs`
Expected: creates `drizzle/0002_stage1_programs.sql` (empty), appends a `0002` entry to `drizzle/meta/_journal.json`, and writes `drizzle/meta/0002_snapshot.json` reflecting the CURRENT `schema.ts`. If the tool instead tries to auto-generate a destructive diff, abort and report — do not accept a generated diff.

Confirm the snapshot is correct: run `npx drizzle-kit generate` (no `--custom`) and expect it to report **no schema changes** (the snapshot already matches `schema.ts`). If it wants to emit a diff, the snapshot is stale — report BLOCKED with the diff it proposes.

- [ ] **Step 2: Fill `drizzle/0002_stage1_programs.sql` with the transform**

```sql
-- New parent tables
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"src_workout_id" uuid
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"default_rest_seconds" integer DEFAULT 90 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- New columns (nullable for backfill)
ALTER TABLE "exercises" ADD COLUMN "variation_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "lineage_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "section_name" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "superset_key" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "target_weight" real;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "day_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "variation_id" uuid;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "hit_target" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: one program + day + Base variation per workout. day.id = workout.id.
INSERT INTO "programs" ("id", "user_id", "name", "created_at", "src_workout_id")
	SELECT gen_random_uuid(), "user_id", "name", "created_at", "id" FROM "workouts";--> statement-breakpoint
INSERT INTO "days" ("id", "program_id", "position", "name", "default_rest_seconds")
	SELECT w."id", p."id", 0, w."name", w."default_rest_seconds"
	FROM "workouts" w JOIN "programs" p ON p."src_workout_id" = w."id";--> statement-breakpoint
INSERT INTO "variations" ("id", "day_id", "position", "name", "created_at")
	SELECT gen_random_uuid(), w."id", 0, 'Base', now() FROM "workouts" w;--> statement-breakpoint
-- Backfill exercises: attach to the Base variation, derive superset_key from block,
-- fresh lineage, day-global position (block order then intra-block order).
UPDATE "exercises" e SET
	"variation_id" = v."id",
	"lineage_id" = gen_random_uuid(),
	"superset_key" = b."id"::text,
	"position" = b."position" * 1000 + e."position"
	FROM "blocks" b JOIN "variations" v ON v."day_id" = b."workout_id"
	WHERE e."block_id" = b."id";--> statement-breakpoint
-- Backfill sessions: point at their day + Base variation.
UPDATE "sessions" s SET "day_id" = s."workout_id", "variation_id" = v."id"
	FROM "variations" v WHERE v."day_id" = s."workout_id";--> statement-breakpoint
-- Enforce NOT NULL now that everything is backfilled.
ALTER TABLE "exercises" ALTER COLUMN "variation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "lineage_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "day_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "variation_id" SET NOT NULL;--> statement-breakpoint
-- Foreign keys.
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Drop the old structure (dropping columns removes their FKs first).
ALTER TABLE "exercises" DROP COLUMN "block_id";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "workout_id";--> statement-breakpoint
DROP TABLE "blocks";--> statement-breakpoint
DROP TABLE "workouts";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "src_workout_id";
```

- [ ] **Step 3: Reconcile the snapshot with the temp column**

The `src_workout_id` temp column exists only during the migration and is dropped at the end, so it must NOT appear in `drizzle/meta/0002_snapshot.json` (which describes the final schema). Since Step 1 generated the snapshot from `schema.ts` (which has no `src_workout_id`), it is already correct — confirm `programs` in `0002_snapshot.json` has exactly `id, user_id, name, created_at` and no `src_workout_id`.

- [ ] **Step 4: Verify the migration on a copy of the real dev DB**

Do NOT touch the live `./.pglite` yet. Copy it and migrate the copy via a throwaway script:

```bash
cp -r ./.pglite /tmp/pglite-migtest && cat > /tmp/migtest.mjs <<'EOF'
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
const c = new PGlite("/tmp/pglite-migtest");
const db = drizzle(c);
const before = await c.query("select count(*)::int n from set_logs");
await migrate(db, { migrationsFolder: "./drizzle" });
const prog = await c.query("select count(*)::int n from programs");
const days = await c.query("select count(*)::int n from days");
const vars = await c.query("select count(*)::int n from variations");
const after = await c.query("select count(*)::int n from set_logs");
const ex = await c.query("select count(*)::int n from exercises where variation_id is null");
console.log("set_logs before/after:", before.rows[0].n, after.rows[0].n);
console.log("programs/days/variations:", prog.rows[0].n, days.rows[0].n, vars.rows[0].n);
console.log("exercises missing variation_id (must be 0):", ex.rows[0].n);
await c.close();
EOF
cp /tmp/migtest.mjs ./_migtest.mjs && npx tsx ./_migtest.mjs; rm -f ./_migtest.mjs; rm -rf /tmp/pglite-migtest /tmp/migtest.mjs
```

Expected: `set_logs before/after` counts are EQUAL (no log loss); programs/days/variations each equal the old workout count; `exercises missing variation_id` is `0`. If any check fails, fix the SQL and re-run against a fresh copy.

- [ ] **Step 5: Apply to the live dev DB and confirm the app boots**

The dev server auto-migrates `./.pglite` on next boot. Ask the controller to restart the dev server (it owns it), then confirm `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/signin` → `200` with no migration error in the dev log. (If running standalone, the controller performs this; note it in your report.)

- [ ] **Step 6: Stage, but do NOT commit yet**

A schema change is atomic: the new `schema.ts` breaks every consumer until
Tasks 4–6 rewire them, so committing here would land a red build. The migration
is now authored and APPLIED to the dev DB (so the app can run for later
verification), but the commit that includes `schema.ts` + `drizzle/` happens at
the end of Task 6, together with the rewired `queries.ts` + `actions.ts`. Leave
the changes in the working tree and proceed to Task 4.

---
### Task 4: Rewire `queries.ts` (read paths)

Keep every exported type and function signature identical so pages don't change; read the new tables and synthesize the `workout`/`blocks` compat shapes. A "workout id" argument is now a **day id** (equal to the old workout id, so callers/routes are unchanged).

**Files:**
- Modify: `src/db/queries.ts`

**Interfaces:**
- Consumes: new schema tables (Task 2), `groupExercisesIntoBlocks` (Task 1).
- Produces: unchanged exports — `WorkoutStructure`, `getWorkoutStructure(dayId, userId)`, `WorkoutListItem`, `listWorkouts(userId)`, `WorkoutHistory`, `getWorkoutHistory(dayId, limit)`, `getUnfinishedSession(dayId, userId)`, `SessionData`, `getSessionData(sessionId, userId)`.

- [ ] **Step 1: Replace the file contents**

```ts
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Block, Exercise, Session, SessionNote, SetLog, Workout } from "@/db/schema";
import { groupExercisesIntoBlocks } from "@/lib/workout";

export type WorkoutStructure = {
  workout: Workout;
  blocks: (Block & { exercises: Exercise[] })[];
};

/** The single "Base" variation of a day (Stage 1 has exactly one per day). */
async function dayView(dayId: string, userId: string) {
  const db = await getDb();
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  if (!day) return null;
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, day.programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  const variation = await db.query.variations.findFirst({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
  const workout: Workout = {
    id: day.id,
    userId: program.userId,
    name: day.name,
    defaultRestSeconds: day.defaultRestSeconds,
    createdAt: program.createdAt,
  };
  return { day, program, variation, workout };
}

export async function getWorkoutStructure(
  dayId: string,
  userId: string,
): Promise<WorkoutStructure | null> {
  const db = await getDb();
  const view = await dayView(dayId, userId);
  if (!view) return null;
  const exercises = view.variation
    ? await db.query.exercises.findMany({
        where: eq(schema.exercises.variationId, view.variation.id),
        orderBy: asc(schema.exercises.position),
      })
    : [];
  const blocks = groupExercisesIntoBlocks(exercises).map((g, i) => ({
    id: g.key,
    position: i,
    exercises: g.exercises,
  }));
  return { workout: view.workout, blocks };
}

export type WorkoutListItem = Workout & {
  exerciseCount: number;
  lastFinishedAt: Date | null;
  unfinishedSessionId: string | null;
};

export async function listWorkouts(userId: string): Promise<WorkoutListItem[]> {
  const db = await getDb();
  const programs = await db.query.programs.findMany({
    where: eq(schema.programs.userId, userId),
    orderBy: asc(schema.programs.createdAt),
  });
  if (!programs.length) return [];
  const programById = new Map(programs.map((p) => [p.id, p]));
  const days = await db.query.days.findMany({
    where: inArray(schema.days.programId, programs.map((p) => p.id)),
    orderBy: asc(schema.days.position),
  });
  if (!days.length) return [];
  const dayIds = days.map((d) => d.id);
  const variations = await db.query.variations.findMany({
    where: inArray(schema.variations.dayId, dayIds),
    orderBy: asc(schema.variations.position),
  });
  // First variation per day = its Base.
  const baseVarByDay = new Map<string, string>();
  for (const v of variations) if (!baseVarByDay.has(v.dayId)) baseVarByDay.set(v.dayId, v.id);
  const baseVarIds = [...baseVarByDay.values()];
  const exercises = baseVarIds.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.variationId, baseVarIds),
      })
    : [];
  const sessions = await db.query.sessions.findMany({
    where: inArray(schema.sessions.dayId, dayIds),
    orderBy: desc(schema.sessions.startedAt),
  });
  // Preserve the old ordering: by program.createdAt, then day.position.
  const ordered = [...days].sort((a, b) => {
    const pa = programById.get(a.programId)!.createdAt.getTime();
    const pb = programById.get(b.programId)!.createdAt.getTime();
    return pa - pb || a.position - b.position;
  });
  return ordered.map((d) => {
    const program = programById.get(d.programId)!;
    const baseVarId = baseVarByDay.get(d.id);
    const mine = sessions.filter((s) => s.dayId === d.id);
    return {
      id: d.id,
      userId: program.userId,
      name: d.name,
      defaultRestSeconds: d.defaultRestSeconds,
      createdAt: program.createdAt,
      exerciseCount: exercises.filter((e) => e.variationId === baseVarId).length,
      lastFinishedAt: mine.find((s) => s.finishedAt)?.finishedAt ?? null,
      unfinishedSessionId: mine.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
}

export type WorkoutHistory = {
  sessions: Session[]; // most recent first, finished only
  logsBySession: Record<string, SetLog[]>;
  notesBySession: Record<string, SessionNote[]>;
};

export async function getWorkoutHistory(dayId: string, limit = 6): Promise<WorkoutHistory> {
  const db = await getDb();
  const sessions = await db.query.sessions.findMany({
    where: eq(schema.sessions.dayId, dayId),
    orderBy: desc(schema.sessions.startedAt),
  });
  const finished = sessions.filter((s) => s.finishedAt).slice(0, limit);
  const logs = finished.length
    ? await db.query.setLogs.findMany({
        where: inArray(schema.setLogs.sessionId, finished.map((s) => s.id)),
        orderBy: asc(schema.setLogs.setNumber),
      })
    : [];
  const logsBySession: Record<string, SetLog[]> = {};
  for (const s of finished) logsBySession[s.id] = logs.filter((l) => l.sessionId === s.id);
  const notes = finished.length
    ? await db.query.sessionNotes.findMany({
        where: inArray(schema.sessionNotes.sessionId, finished.map((s) => s.id)),
      })
    : [];
  const notesBySession: Record<string, SessionNote[]> = {};
  for (const s of finished) notesBySession[s.id] = notes.filter((n) => n.sessionId === s.id);
  return { sessions: finished, logsBySession, notesBySession };
}

export async function getUnfinishedSession(dayId: string, userId: string) {
  const db = await getDb();
  const view = await dayView(dayId, userId);
  if (!view) return undefined;
  return db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.dayId, dayId),
      eq(schema.sessions.userId, userId),
      isNull(schema.sessions.finishedAt),
    ),
    orderBy: desc(schema.sessions.startedAt),
  });
}

export type SessionData = {
  session: Session;
  structure: WorkoutStructure;
  logs: SetLog[];
  previousLogs: SetLog[];
  notes: SessionNote[];
};

export async function getSessionData(
  sessionId: string,
  userId: string,
): Promise<SessionData | null> {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)),
  });
  if (!session) return null;
  const structure = await getWorkoutStructure(session.dayId, userId);
  if (!structure) return null;
  const logs = await db.query.setLogs.findMany({
    where: eq(schema.setLogs.sessionId, sessionId),
  });
  const previous = await db.query.sessions.findMany({
    where: and(eq(schema.sessions.dayId, session.dayId), eq(schema.sessions.userId, userId)),
    orderBy: desc(schema.sessions.startedAt),
  });
  const prev = previous.find((s) => s.finishedAt && s.startedAt < session.startedAt);
  const previousLogs = prev
    ? await db.query.setLogs.findMany({ where: eq(schema.setLogs.sessionId, prev.id) })
    : [];
  const notes = await db.query.sessionNotes.findMany({
    where: eq(schema.sessionNotes.sessionId, sessionId),
  });
  return { session, structure, logs, previousLogs, notes };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — `queries.ts` errors are gone; remaining errors only in `actions.ts` (Tasks 5–6). `npm run lint` on this file clean.

Do not commit alone — land with Task 5 to keep the tree green. (If the harness requires a commit boundary, it's acceptable for the tree to be red between Tasks 4 and 5; the reviewer treats Tasks 4–6 as the read/write rewire unit. Prefer committing at the end of Task 6.)

---

### Task 5: Rewire `actions.ts` — structure & session mutations

Same exported signatures; write the new tables. A created "workout" becomes a program + day + Base variation; exercises are flattened with a per-block `superset_key`.

**Files:**
- Modify: `src/app/actions.ts` (everything except the import payload types/`importSpreadsheet`, which is Task 6)

**Interfaces:**
- Consumes: new schema.
- Produces: unchanged exports — `ExerciseInput`, `BlockInput`, `WorkoutInput`, `createWorkout`, `updateWorkout`, `deleteWorkout`, `startSession`, `logSet`, `saveSessionNote`, `finishSession`, `deleteSession`.
- Internal helpers used by Task 6: `flattenBlockExercises(blocks, variationId)` → exercise insert rows.

- [ ] **Step 1: Replace helpers + structure actions**

Keep `ExerciseInput`/`BlockInput`/`WorkoutInput`/`sanitizeWorkout` exactly as they are. Replace `insertBlocks`, `ownedWorkout`, `createWorkout`, `updateWorkout`, `deleteWorkout`, `startSession` with:

```ts
/** Flatten builder blocks into exercise rows for one variation: one shared
 * superset_key per block, day-global position, fresh lineage. */
function flattenBlockExercises(blocks: BlockInput[], variationId: string) {
  const rows: (typeof schema.exercises.$inferInsert)[] = [];
  blocks.forEach((block, i) => {
    const supersetKey = crypto.randomUUID();
    block.exercises.forEach((e, j) => {
      rows.push({
        variationId,
        position: i * 1000 + j,
        lineageId: crypto.randomUUID(),
        sectionName: null,
        supersetKey,
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
        targetWeight: null,
      });
    });
  });
  return rows;
}

export async function createWorkout(input: WorkoutInput) {
  const userId = await requireUserId();
  const db = await getDb();
  const data = sanitizeWorkout(input);
  let dayId = "";
  await db.transaction(async (tx) => {
    const [program] = await tx
      .insert(schema.programs)
      .values({ userId, name: data.name })
      .returning({ id: schema.programs.id });
    const [day] = await tx
      .insert(schema.days)
      .values({ programId: program.id, position: 0, name: data.name, defaultRestSeconds: data.defaultRestSeconds })
      .returning({ id: schema.days.id });
    const [variation] = await tx
      .insert(schema.variations)
      .values({ dayId: day.id, position: 0, name: "Base" })
      .returning({ id: schema.variations.id });
    const rows = flattenBlockExercises(data.blocks, variation.id);
    if (rows.length) await tx.insert(schema.exercises).values(rows);
    dayId = day.id;
  });
  revalidatePath("/workouts");
  redirect(`/workouts/${dayId}`);
}

/** Verify the day belongs to the user; return it (with programId). */
async function ownedDay(dayId: string, userId: string) {
  const db = await getDb();
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  if (!day) throw new Error("Workout not found");
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, day.programId), eq(schema.programs.userId, userId)),
  });
  if (!program) throw new Error("Workout not found");
  return day;
}

async function baseVariationId(dayId: string): Promise<string> {
  const db = await getDb();
  const v = await db.query.variations.findFirst({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
  if (!v) throw new Error("Variation missing");
  return v.id;
}

/**
 * Update-in-place: exercises whose ids are echoed back are updated (preserving
 * their set-log history), missing ones are deleted, new ones inserted. Blocks
 * are re-keyed each save (grouping is cosmetic; exercise identity is what
 * carries history).
 */
export async function updateWorkout(dayId: string, input: WorkoutInput) {
  const userId = await requireUserId();
  await ownedDay(dayId, userId);
  const db = await getDb();
  const data = sanitizeWorkout(input);
  const variationId = await baseVariationId(dayId);

  await db
    .update(schema.days)
    .set({ name: data.name, defaultRestSeconds: data.defaultRestSeconds })
    .where(eq(schema.days.id, dayId));

  const existing = await db.query.exercises.findMany({
    where: eq(schema.exercises.variationId, variationId),
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set(
    data.blocks
      .flatMap((b) => b.exercises.map((e) => e.id))
      .filter((id): id is string => !!id && existingIds.has(id)),
  );
  const dropIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (dropIds.length) await db.delete(schema.exercises).where(inArray(schema.exercises.id, dropIds));

  for (const [i, block] of data.blocks.entries()) {
    const supersetKey = crypto.randomUUID();
    for (const [j, e] of block.exercises.entries()) {
      const common = {
        position: i * 1000 + j,
        sectionName: null,
        supersetKey,
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
      };
      if (e.id && keptIds.has(e.id)) {
        await db.update(schema.exercises).set(common).where(eq(schema.exercises.id, e.id));
      } else {
        await db.insert(schema.exercises).values({
          ...common,
          variationId,
          lineageId: crypto.randomUUID(),
          targetWeight: null,
        });
      }
    }
  }

  revalidatePath("/workouts");
  revalidatePath(`/workouts/${dayId}`);
  redirect(`/workouts/${dayId}`);
}

export async function deleteWorkout(dayId: string) {
  const userId = await requireUserId();
  const day = await ownedDay(dayId, userId);
  const db = await getDb();
  await db.delete(schema.days).where(eq(schema.days.id, dayId));
  const remaining = await db.query.days.findFirst({
    where: eq(schema.days.programId, day.programId),
  });
  if (!remaining) await db.delete(schema.programs).where(eq(schema.programs.id, day.programId));
  revalidatePath("/workouts");
  redirect("/workouts");
}

export async function startSession(dayId: string) {
  const userId = await requireUserId();
  await ownedDay(dayId, userId);
  const db = await getDb();
  const variationId = await baseVariationId(dayId);
  const [session] = await db
    .insert(schema.sessions)
    .values({ dayId, variationId, userId })
    .returning({ id: schema.sessions.id });
  redirect(`/sessions/${session.id}`);
}
```

- [ ] **Step 2: Fix the import list and session-path references**

At the top of `actions.ts`, add `asc` to the `drizzle-orm` import:

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
```

In `finishSession` and `deleteSession`, replace both `session.workoutId` references with `session.dayId` (the revalidate/redirect paths — `/workouts/${session.dayId}`). `ownedSession`, `logSet`, and `saveSessionNote` are unchanged.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — remaining errors only in `importSpreadsheet` (Task 6). `npm test` for unaffected suites still green.

---

### Task 6: Rewire `importSpreadsheet` to the new model

Keep the payload types and external behavior; write program/day/variation + flattened exercises instead of workouts/blocks. (Full import redesign is Stage 5; this only keeps it compiling and working.)

**Files:**
- Modify: `src/app/actions.ts` (the `importSpreadsheet` function only)

**Interfaces:**
- Consumes: `flattenBlockExercises` shape is not reused here (import builds its own rows); new schema.
- Produces: unchanged `importSpreadsheet(days: ImportDayPayload[])`.

- [ ] **Step 1: Replace the function body**

Replace `importSpreadsheet` (keep the payload type exports above it unchanged) with:

```ts
export async function importSpreadsheet(days: ImportDayPayload[]) {
  const userId = await requireUserId();
  const db = await getDb();

  await db.transaction(async (tx) => {
    for (const dayPayload of days) {
      const name = dayPayload.name.trim().slice(0, 80) || "Imported workout";
      const [program] = await tx
        .insert(schema.programs)
        .values({ userId, name })
        .returning({ id: schema.programs.id });
      const [day] = await tx
        .insert(schema.days)
        .values({ programId: program.id, position: 0, name, defaultRestSeconds: 90 })
        .returning({ id: schema.days.id });
      const [variation] = await tx
        .insert(schema.variations)
        .values({ dayId: day.id, position: 0, name: "Base" })
        .returning({ id: schema.variations.id });

      const sessionIds: string[] = [];
      for (const iso of dayPayload.dates) {
        const startedAt = new Date(iso);
        if (Number.isNaN(startedAt.getTime())) throw new Error("Invalid date in import");
        const [s] = await tx
          .insert(schema.sessions)
          .values({ dayId: day.id, variationId: variation.id, userId, startedAt, finishedAt: startedAt })
          .returning({ id: schema.sessions.id });
        sessionIds.push(s.id);
      }

      // Group merged-Sets rows into supersets; blocks hold at most 3 exercises.
      const groups: ImportExercisePayload[][] = [];
      for (const e of dayPayload.exercises) {
        const last = groups.at(-1);
        if (e.blockStart || !last || last.length >= 3) groups.push([e]);
        else last.push(e);
      }

      for (const [gi, group] of groups.entries()) {
        const supersetKey = crypto.randomUUID();
        for (const [j, e] of group.entries()) {
          const sets = Math.min(20, Math.max(1, Math.round(e.sets) || 1));
          const [exercise] = await tx
            .insert(schema.exercises)
            .values({
              variationId: variation.id,
              position: gi * 1000 + j,
              lineageId: crypto.randomUUID(),
              sectionName: null,
              supersetKey,
              name: e.name.trim().slice(0, 120),
              sets,
              measurement: "reps",
              repScheme: e.repScheme === "failure" ? "failure" : "fixed",
              repsMin:
                e.repScheme === "failure"
                  ? null
                  : Math.min(999, Math.max(1, Math.round(e.repsMin ?? 10))),
              repsMax: null,
              timeSeconds: null,
              restOverrideSeconds: null,
              note: e.note?.trim().slice(0, 500) || null,
              weightUnit: e.weightUnit === "bricks" ? "bricks" : "kg",
              targetWeight: null,
            })
            .returning({ id: schema.exercises.id });

          for (const [ci, cell] of e.cells.entries()) {
            const sessionId = sessionIds[ci];
            if (!cell || !sessionId) continue;
            const logs = cell.sets
              .filter((s) => s.setNumber >= 1 && s.setNumber <= sets)
              .map((s) => ({
                sessionId,
                exerciseId: exercise.id,
                setNumber: Math.round(s.setNumber),
                weight: s.weight,
                reps: s.reps == null ? null : Math.round(s.reps),
                timeSeconds: null,
              }));
            if (logs.length) await tx.insert(schema.setLogs).values(logs);
            if (cell.note?.trim()) {
              await tx.insert(schema.sessionNotes).values({
                sessionId,
                exerciseId: exercise.id,
                note: cell.note.trim().slice(0, 500),
              });
            }
          }
        }
      }
    }
  });

  revalidatePath("/workouts");
  redirect("/workouts");
}
```

- [ ] **Step 2: Verify green**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass (the whole app compiles against the new model).

- [ ] **Step 3: Commit the whole atomic migration (schema + migration + rewire)**

This is the first green commit since Task 1 — it includes everything from Tasks
2–6, which had to land together.

```bash
git add src/db/schema.ts drizzle/ src/db/queries.ts src/app/actions.ts
git commit -m "refactor: migrate to program/day/variation model, preserving all data"
```

---

### Task 7: End-to-end verification (app behaves as before)

**Files:** none (verification only)

- [ ] **Step 1: Static gates**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 34/34 tests + the new grouping tests pass; build succeeds for all routes.

- [ ] **Step 2: Authenticated runtime — nothing regressed**

With the controller's dev server running and the migrated `./.pglite`, sign in with the dev login and confirm (controller drives this; the plan lists exactly what to check):
1. `/workouts` lists the same workouts as before the migration (e.g. the "V2 Demo (verify)" day), with correct exercise counts and last-done dates.
2. Open a workout: the Plan shows the same exercises/supersets; the History grid shows the same sessions, durations, dense cells, weight column, and note markers.
3. Start a session, log a set, finish it — appears in history.
4. Edit the workout (rename, reorder, add/remove an exercise) — saves and preserves prior history for kept exercises.
5. Open a finished session and edit a set — persists.
6. Import the example paste from the earlier import flow — creates a workout (now a program/day) that appears and can be trained.
7. Export CSV — still returns the user's rows.

- [ ] **Step 3: Commit any fixes discovered**

```bash
git add -A && git commit -m "fix: stage 1 polish from end-to-end verification"   # only if needed
```

## Self-review notes

- **Spec coverage:** tables (programs/days/variations, flattened exercises, hit_target) ✓ Task 2; migration with data preservation ✓ Task 3; read paths ✓ Task 4; write paths ✓ Tasks 5–6; "behaves as before" ✓ Task 7. Stage-1-out-of-scope items (variations UI, sections UI, target-weight entry, OK, quick-taps, import redesign, example.csv) are deferred to later stages by design.
- **hit_target** is added to the schema/migration now but not yet written by `logSet` (Stage 4 wires the OK button); it defaults false, so history/export are unaffected.
- **targetWeight/sectionName/lineageId** exist and migrate but are not surfaced yet — later stages consume them. `lineageId` is populated (fresh per exercise) so Stage 2's history-alignment has data to work with.

