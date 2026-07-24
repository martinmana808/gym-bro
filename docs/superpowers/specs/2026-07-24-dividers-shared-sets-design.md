# Muscle-group Dividers + Shared Superset Sets

**Date:** 2026-07-24
**Status:** Approved design (user: "yes that is ok, go ahead")

## Context

Two workout-builder improvements:

1. **Muscle groups as dividers.** Today each exercise block has a "Muscle group"
   text field, and the display groups consecutive same-`sectionName` blocks under
   a header. The user organizes workouts by dropping a **divider/bookmark** row
   ("Biceps") and adding the exercises that belong under it, then another divider
   ("Back"), etc. — not by tagging every block.
2. **Shared sets in a superset/triset.** All exercises in a superset repeat the
   same number of times, so a grouped block should have **one** Sets control, not
   one per exercise.

## Key property: builder-only change

Both changes are **entirely within `WorkoutBuilder.tsx`**. The stored data model,
the server actions (`createWorkout`/`updateVariation`/`importProgram`), the runner
(`buildSteps`), and the Plan/History displays are **unchanged**:

- Sections are still `sectionName` on each exercise (a divider just decides what
  `sectionName` the blocks below it get, on save). The `WorkoutInput`/`BlockInput`
  payload shape (a block carries `sectionName` + `exercises`) is identical.
- Sets are still per-exercise in storage; the builder simply writes the **same**
  sets value to every exercise in a grouped block. `buildSteps` already runs
  correctly when a block's exercises share a sets count.

So: **no migration, no action changes, no runner/display changes.**

## Builder redesign

The builder's state changes from a flat `blocks: BlockDraft[]` to an ordered
list of **items**, each either a divider or an exercise block:

```
type BuilderItem =
  | { kind: "divider"; key: string; name: string }
  | { kind: "block"; key: string; id?: string; sets: number; exercises: ExerciseDraft[] };
```

- **Sets move to the block** (`block.sets`) instead of per-exercise. A block shows
  ONE Sets picker (at the top of the block). A single-exercise block and a
  superset both use this one field.
- **`sectionName` leaves the exercise draft / block field.** It's now expressed by
  divider items between blocks.

### Rendering

Iterate items in order:
- **Divider:** a labeled row — a name input (placeholder "Muscle group, e.g. Biceps"),
  plus move-up / move-down / remove controls, visually distinct (small, lime-ish
  header styling) so it reads as a section bookmark.
- **Block:** the existing exercise-block card, minus the per-block muscle field and
  minus per-exercise Sets fields; gains one block-level Sets picker.

### Controls

- **"+ Muscle group"** appends a `divider` item (empty name).
- **"+ Add exercise block"** appends a `block` item with one empty exercise.
- Move up/down and remove work on items (dividers and blocks alike). Removing a
  divider merges the blocks below it into the section above (they take whatever
  divider now precedes them).

### Save (items → `WorkoutInput`)

Walk items in order, tracking `currentSection` (starts `null`, set by each divider
to its trimmed name or `null` if blank). For each `block` item, emit a `BlockInput`:
`{ id, sectionName: currentSection, exercises: exercises.map(e => ({ ...e, sets: block.sets })) }`.
Blocks with no non-empty exercise are dropped (as today). Empty dividers (no blocks
under them, or blank name) simply contribute no section.

### Load (edit — structure → items)

Given `structure.blocks` (each block's exercises carry `sectionName`), rebuild items:
walk blocks in order; when a block's section (its `exercises[0].sectionName`)
differs from the previous block's section and is non-null, insert a `divider` item
with that name before it. Then the `block` item with `sets` = the block's exercises'
sets (take the first; they should match — if a legacy block has mismatched sets,
use the max so no round is lost). New workouts start with one empty block, no
dividers.

## Ranges / pickers

Sets still uses the `NumberSelect` picker, range 1–10, now at block level.

## Non-goals

- No behavior on dividers (labels only, as already decided).
- No change to how supersets are created (the existing "+ Pair exercise" inside a
  block still makes it a superset; that block's one Sets field governs all).
- No data migration; existing `sectionName`/`sets` values load into the new UI.

## Edge cases

- Exercises before the first divider → `sectionName` null (un-grouped) — fine.
- A blank-named divider → contributes `null` section (same as none).
- A superset whose stored exercises have differing sets (legacy/import) → the
  builder shows the max on load; saving normalizes all to that one value.

## Testing

- Unit: an `itemsToBlocks(items)` pure helper (section tracking + sets expansion)
  and a `blocksToItems(blocks)` pure helper (divider reconstruction) — round-trip a
  couple of shapes (two sections, a superset, a leading un-grouped block).
- Manual (deployed PWA): build a workout with a "Biceps" divider + two exercises,
  a "Back" divider + a superset; confirm one Sets field on the superset; save;
  reopen edit → dividers + sets reappear; the Plan shows the same headers; run it.

## Rollout

Build, verify, commit, deploy (`vercel deploy --prod`).
