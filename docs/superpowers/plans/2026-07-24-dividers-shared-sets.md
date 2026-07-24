# Dividers + Shared Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Rework the workout builder so muscle groups are insertable **divider** rows and a superset/triset has **one shared Sets** field — with no change to storage, actions, runner, or displays.

**Spec:** `docs/superpowers/specs/2026-07-24-dividers-shared-sets-design.md`

## Global Constraints

- Builder-only change. `WorkoutInput`/`BlockInput` payload shape is unchanged (a block still carries `sectionName` + `exercises[]`, each exercise still has `sets`). `actions.ts`, `buildSteps`, Plan/History, runner: untouched.
- Sets move to block level in the builder; on save every exercise in a block gets the block's sets. Sections come from divider items; on save each block's `sectionName` = the most-recent divider's trimmed name (or null).
- No migration. Existing data loads into the new UI.
- Verify `npm test`, `npx tsc --noEmit`, `npm run lint` before each commit. Commit every task. Controller deploys after.
- Servers are controller-managed — do not start one.

---

### Task 1: Pure helpers `itemsToBlocks` / `blocksToItems` (TDD)

**Files:** `src/lib/workout.ts`, `src/lib/workout.test.ts`

**Interfaces (Produces):**
```ts
export type BuilderDivider = { kind: "divider"; key: string; name: string };
export type BuilderBlock<E> = { kind: "block"; key: string; id?: string; sets: number; exercises: E[] };
export type BuilderItem<E> = BuilderDivider | BuilderBlock<E>;
export function itemsToBlocks<E>(items: BuilderItem<E>[]):
  { id?: string; sectionName: string | null; exercises: (E & { sets: number })[] }[];
export function blocksToItems<E extends { sectionName: string | null; sets: number }>(
  blocks: { id?: string; exercises: E[] }[], makeKey: () => string,
): BuilderItem<E>[];
```

- [ ] **Step 1: Tests** — append to `src/lib/workout.test.ts`:

```ts
import { itemsToBlocks, blocksToItems } from "./workout";

describe("itemsToBlocks", () => {
  const D = (name: string): BuilderDivider => ({ kind: "divider", key: `d-${name}`, name });
  const B = (sets: number, ...ex: { id: string }[]): BuilderBlock<{ id: string }> =>
    ({ kind: "block", key: `b-${ex[0]?.id}`, sets, exercises: ex });

  it("assigns each block the current divider's section and the block's sets", () => {
    const out = itemsToBlocks([
      D("Biceps"), B(4, { id: "a" }, { id: "b" }),
      D("Back"), B(3, { id: "c" }),
    ]);
    expect(out).toEqual([
      { id: undefined, sectionName: "Biceps", exercises: [{ id: "a", sets: 4 }, { id: "b", sets: 4 }] },
      { id: undefined, sectionName: "Back", exercises: [{ id: "c", sets: 3 }] },
    ]);
  });
  it("leaves blocks before the first divider un-sectioned, and blank dividers => null", () => {
    const out = itemsToBlocks([B(2, { id: "x" }), D("  "), B(2, { id: "y" })]);
    expect(out.map((b) => b.sectionName)).toEqual([null, null]);
  });
});

describe("blocksToItems", () => {
  let n = 0;
  const key = () => `k${n++}`;
  const ex = (id: string, sectionName: string | null, sets: number) => ({ id, sectionName, sets });

  it("inserts a divider when the section changes to a new non-null value", () => {
    n = 0;
    const items = blocksToItems(
      [
        { id: "b1", exercises: [ex("a", "Biceps", 4), ex("b", "Biceps", 4)] },
        { id: "b2", exercises: [ex("c", "Back", 3)] },
      ],
      key,
    );
    expect(items.map((i) => (i.kind === "divider" ? `DIV:${i.name}` : `BLK:${i.sets}`))).toEqual([
      "DIV:Biceps", "BLK:4", "DIV:Back", "BLK:3",
    ]);
  });
  it("uses the max sets of a block and no divider for a leading null section", () => {
    n = 0;
    const items = blocksToItems([{ id: "b1", exercises: [ex("a", null, 2), ex("b", null, 4)] }], key);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "block", sets: 4 });
  });
});
```

- [ ] **Step 2: Run → RED** (`npm test`).

- [ ] **Step 3: Implement** in `src/lib/workout.ts`:

```ts
export type BuilderDivider = { kind: "divider"; key: string; name: string };
export type BuilderBlock<E> = { kind: "block"; key: string; id?: string; sets: number; exercises: E[] };
export type BuilderItem<E> = BuilderDivider | BuilderBlock<E>;

/** Flatten builder items into blocks: each block's exercises inherit the block's
 * sets and the most-recent divider's (trimmed, else null) section name. */
export function itemsToBlocks<E>(
  items: BuilderItem<E>[],
): { id?: string; sectionName: string | null; exercises: (E & { sets: number })[] }[] {
  const blocks: { id?: string; sectionName: string | null; exercises: (E & { sets: number })[] }[] = [];
  let section: string | null = null;
  for (const it of items) {
    if (it.kind === "divider") {
      section = it.name.trim() || null;
      continue;
    }
    blocks.push({
      id: it.id,
      sectionName: section,
      exercises: it.exercises.map((e) => ({ ...e, sets: it.sets })),
    });
  }
  return blocks;
}

/** Rebuild builder items from stored blocks: insert a divider when the section
 * changes to a new non-null value; a block's sets = the max of its exercises'. */
export function blocksToItems<E extends { sectionName: string | null; sets: number }>(
  blocks: { id?: string; exercises: E[] }[],
  makeKey: () => string,
): BuilderItem<E>[] {
  const items: BuilderItem<E>[] = [];
  let prev: string | null = null;
  for (const b of blocks) {
    const section = b.exercises[0]?.sectionName ?? null;
    if (section && section !== prev) items.push({ kind: "divider", key: makeKey(), name: section });
    prev = section;
    const sets = Math.max(1, ...b.exercises.map((e) => e.sets));
    items.push({ kind: "block", key: makeKey(), id: b.id, sets, exercises: b.exercises });
  }
  return items;
}
```

- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint`; commit:
`git add src/lib/workout.ts src/lib/workout.test.ts && git commit -m "feat: itemsToBlocks/blocksToItems builder helpers"`

---

### Task 2: Rework `WorkoutBuilder` — dividers + block-level sets

**Files:** `src/components/WorkoutBuilder.tsx`

**Interfaces:** Consumes Task 1 helpers + types, and the existing `NumberSelect`.

The rewrite keeps ALL the existing per-exercise field JSX (name, note, Type, weight unit, target weight, reps target/fixed/range, duration, rest override) EXACTLY as-is. What changes:

- **State:** replace `blocks: BlockDraft[]` with `items: BuilderItem<ExerciseDraft>[]`.
  - `ExerciseDraft` drops `sets` (sets is now block-level) — keep everything else. `emptyExercise()` no longer sets `sets`.
  - Initial: `initial?.blocks` → `blocksToItems(initial.blocks.map(b => ({ id: b.id, exercises: b.exercises.map(e => ({...e, key: e.id ?? nextKey()})) })), nextKey)`. Note: each block's exercises carry `sectionName` and `sets` from the DB (they're `ExerciseInput` which has both), so `blocksToItems` can read them. If no `initial`, start with `[{ kind: "block", key: nextKey(), sets: 3, exercises: [emptyExercise()] }]`.
  - (Because `BlockInput.exercises` are `ExerciseInput` which still carry `sets`/`sectionName`, `blocksToItems` type constraint `E extends { sectionName; sets }` is satisfied by the mapped exercise objects — ensure the mapped exercise keeps `sectionName` and `sets` so the helper can read them, then the block's `sets`/section are derived and the per-exercise copies are ignored thereafter.)

- **Rendering:** map over `items`:
  - `divider` → a labeled row: `NumberSelect`-free; a text `<input>` for the name (placeholder "Muscle group, e.g. Biceps"), styled as a small lime-tinted bookmark header, plus IconButtons for move up / move down / remove (reuse the existing `IconButton`). Distinct look from a block (e.g. no card border, a lime left accent, uppercase).
  - `block` → the existing exercise-block `<section>` card, BUT: remove the per-block "Muscle group" `<input>`; and put ONE block-level Sets picker in the block header area: `<NumberSelect min={1} max={10} step={1} value={`${block.sets}`} onChange={(v)=> setItems(update block.sets = Number(v))} />` with a "Sets" label. Remove the per-exercise Sets `NumberSelect` from each exercise's field grid.
  - The move up/down/remove on a block operate on the `items` array (swap with neighbor item / filter out).

- **Controls (bottom):** keep "+ Add exercise block" (appends a `block` item with one `emptyExercise()` and `sets: 3`). Add **"+ Muscle group"** (appends a `divider` item with `name: ""`). "+ Pair exercise (superset)" inside a block still adds an exercise to that block's `exercises` (unchanged; the block's one Sets field now governs all).

- **Save:** `const blocks = itemsToBlocks(items).map(b => ({ id: b.id, sectionName: b.sectionName, exercises: b.exercises.map(e => ({ ...strip key ..., }))}))`. Concretely, build `WorkoutInput.blocks` from `itemsToBlocks(items)`: each returned block already has `sectionName` and exercises with `sets`; map each exercise to the `ExerciseInput` fields (id, name, sets, measurement, repScheme, repsMin, repsMax, timeSeconds, restOverrideSeconds, note, weightUnit, targetWeight) — `sets` comes from the helper's expansion. Keep the existing "at least one named exercise" guard and the `updateVariation`/`createWorkout` dispatch.

Helper for updating an item immutably (add near the top of the component):
```ts
const patchBlock = (bi: number, patch: Partial<BuilderBlock<ExerciseDraft>>) =>
  setItems((its) => its.map((it, i) => (i === bi && it.kind === "block" ? { ...it, ...patch } : it)));
const patchExercise = (bi: number, ei: number, patch: Partial<ExerciseDraft>) =>
  setItems((its) =>
    its.map((it, i) =>
      i === bi && it.kind === "block"
        ? { ...it, exercises: it.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) }
        : it,
    ),
  );
```
(All existing `patchExercise(bi, ei, …)` calls keep working with the same signature.) `blockLabel(block.exercises.length)` still labels the block; the "1. SUPERSET" numbering can number blocks only (skip dividers) or number every item — number blocks only for continuity.

- [ ] **Step 1:** Implement the rework per above.
- [ ] **Step 2:** `npm test && npx tsc --noEmit && npm run lint` green.
- [ ] **Step 3:** commit: `git add src/components/WorkoutBuilder.tsx && git commit -m "feat: muscle-group dividers and shared block-level sets in the builder"`

---

### Task 3: Verify

- [ ] `npm test && npx tsc --noEmit && npm run lint && npm run build` green. Controller runs the runtime check (build a workout with a divider + superset, save, reopen, confirm dividers/sets round-trip) and deploys.
