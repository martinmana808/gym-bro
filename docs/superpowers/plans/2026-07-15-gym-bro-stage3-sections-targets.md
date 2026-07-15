# Gym Bro Stage 3: Muscle Sections + Target Weights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Let a workout be organized into named **muscle sections** (Pecs, Biceps — just labels), and give each exercise a **target weight** per variation that pre-fills when you train.

**Architecture:** `sectionName` and `targetWeight` already exist as (currently-null) columns on `exercises`. This stage plumbs them through the builder payload, the write actions, and the display: the builder gets a per-block section label and a per-exercise target-weight field; the Plan and History group consecutive blocks under section headers; the runner pre-fills weight from the target. New payload fields are OPTIONAL so tasks stay independently green.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-gym-bro-programs-variations-design.md` (Stage 3).

## Global Constraints

- Sections are labels only (no behavior). `sectionName` lives on each exercise; all exercises in a builder block share the block's section. Consecutive blocks with the same non-null `sectionName` render under one header; `null` = no section header.
- `targetWeight` is per exercise per variation (nullable `real`); `null` = no target / bodyweight. Interpreted in the exercise's `weightUnit`.
- Runner weight prefill order: `existing (this session) ?? targetWeight ?? prev (last session, same variation) ?? last-weight-this-session ?? ""`.
- No schema migration (columns already exist). No new tables.
- Ownership unchanged (writes go through the existing `updateVariation`/`createWorkout` which already authorize).
- Verification: `npm test`, `npx tsc --noEmit`, `npm run lint` pass before every commit; commit every task. Dev server is controller-owned (port 3000).
- Styling matches app (dark, lime accents, small uppercase micro-labels for section headers).

## File structure

- `src/lib/workout.ts` — `RunnerExercise` gains `targetWeight`; add `formatTargetWeight` helper.
- `src/app/actions.ts` — `ExerciseInput.targetWeight?`, `BlockInput.sectionName?`; sanitize + `flattenBlockExercises` + `updateVariation` carry them.
- `src/components/WorkoutBuilder.tsx` — per-block section input; per-exercise target-weight input.
- `src/app/workouts/[id]/page.tsx` — Plan + History grouped by section header; Plan line shows target weight.
- `src/components/SessionRunner.tsx` — target-weight prefill; target chip shows target weight.

---

### Task 1: Domain type + payloads + write actions

**Files:** `src/lib/workout.ts`, `src/app/actions.ts`, `src/lib/workout.test.ts`

**Interfaces (Produces):**
- `RunnerExercise` gains `targetWeight: number | null`.
- `formatTargetWeight(e: { targetWeight: number | null; weightUnit: WeightUnit }): string` — `formatCurrentWeight(e.targetWeight, e.weightUnit)` (returns "60 kg" | "20 br" | "—").
- `ExerciseInput` gains `targetWeight?: number | null`; `BlockInput` gains `sectionName?: string | null`.
- `flattenBlockExercises` and `updateVariation` persist `sectionName` (from the block) and `targetWeight` (from the exercise).

- [ ] **Step 1: Domain type + helper (with a test)**

In `src/lib/workout.ts`, add `targetWeight: number | null;` to `RunnerExercise` (after `weightUnit`), and add:

```ts
/** "60 kg" | "20 br" | "—" — a labelled per-exercise target weight. */
export function formatTargetWeight(e: { targetWeight: number | null; weightUnit: WeightUnit }): string {
  return formatCurrentWeight(e.targetWeight, e.weightUnit);
}
```

In `src/lib/workout.test.ts`, update the `ex` helper (the one building `RunnerExercise`) to include `targetWeight: null,`, and add a small test:

```ts
describe("formatTargetWeight", () => {
  it("labels the target weight or shows a dash", () => {
    expect(formatTargetWeight({ targetWeight: 60, weightUnit: "kg" })).toBe("60 kg");
    expect(formatTargetWeight({ targetWeight: 20, weightUnit: "bricks" })).toBe("20 br");
    expect(formatTargetWeight({ targetWeight: null, weightUnit: "kg" })).toBe("—");
  });
});
```

Add `formatTargetWeight` to the test's import from `./workout`.

- [ ] **Step 2: Payload fields + sanitize + persistence**

In `src/app/actions.ts`:
- `ExerciseInput`: add `targetWeight?: number | null;`
- `BlockInput`: change to `{ id?: string; sectionName?: string | null; exercises: ExerciseInput[] }`
- In `sanitizeWorkout`, the block map: keep `sectionName: b.sectionName?.trim() ? b.sectionName.trim().slice(0, 40) : null,` on each block; in the exercise map add:
  `targetWeight: e.targetWeight == null || `${e.targetWeight}` === "" ? null : Math.max(0, Number(e.targetWeight)) || null,`
  (Update the `WorkoutInput`/`BlockInput` shapes so `sectionName` survives sanitize — the sanitized block object must include `sectionName`.)
- In `flattenBlockExercises`, set on each row: `sectionName: block.sectionName ?? null,` (replace the hard-coded `sectionName: null`) and `targetWeight: e.targetWeight ?? null,` (replace `targetWeight: null`).
- In `updateVariation`, in the `common` object add `sectionName: block.sectionName ?? null,` and `targetWeight: e.targetWeight ?? null,` (both the update and insert paths use `common`).

- [ ] **Step 3: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint` — the `formatTargetWeight` test passes; existing callers of `RunnerExercise` may need `targetWeight` — the pages/components that BUILD RunnerExercise objects (session page `blocks={structure.blocks...}` maps exercises straight from DB rows which now include `targetWeight`, so they carry it automatically; the builder's `ExerciseDraft` extends `ExerciseInput` whose new field is optional). If tsc flags a spot that constructs a `RunnerExercise` literal without `targetWeight`, add `targetWeight: e.targetWeight` there.
Commit: `git add src/lib/workout.ts src/lib/workout.test.ts src/app/actions.ts && git commit -m "feat: section + target-weight payload plumbing and formatter"`

---

### Task 2: Builder — section label + target-weight field

**Files:** `src/components/WorkoutBuilder.tsx`

- [ ] **Step 1: Draft shapes + defaults**

`BlockDraft` gains `sectionName: string | null`. `emptyExercise()` gains `targetWeight: null`. When building initial blocks from `initial.blocks`, carry `sectionName: b.sectionName ?? null`. When creating a new empty block (`+ Add exercise block`), set `sectionName: null`.

- [ ] **Step 2: Per-block section input**

In the block `<header>`, under the `{bi+1}. {blockLabel}` line, add a section text input bound to the block:

```tsx
          <input
            className={field}
            value={block.sectionName ?? ""}
            onChange={(ev) =>
              setBlocks((bs) =>
                bs.map((b, i) => (i === bi ? { ...b, sectionName: ev.target.value || null } : b)),
              )
            }
            placeholder="Muscle group (e.g. Pecs) — optional"
          />
```

- [ ] **Step 3: Per-exercise target-weight field**

In the exercise fields grid (near the Weight-unit select), add:

```tsx
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">Target weight ({e.weightUnit === "bricks" ? "bricks" : "kg"})</span>
                    <input
                      className={field}
                      type="number"
                      min={0}
                      inputMode="decimal"
                      step={e.weightUnit === "bricks" ? 1 : 2.5}
                      value={e.targetWeight ?? ""}
                      placeholder="—"
                      onChange={(ev) =>
                        patchExercise(bi, ei, {
                          targetWeight: ev.target.value === "" ? null : Number(ev.target.value),
                        })
                      }
                    />
                  </label>
```

- [ ] **Step 4: Save payload carries the new fields**

In `save()`, the block mapping adds `sectionName: b.sectionName,` and the exercise mapping adds `targetWeight: e.targetWeight,`.

- [ ] **Step 5: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint`.
Commit: `git add src/components/WorkoutBuilder.tsx && git commit -m "feat: builder section label and per-exercise target weight"`

---

### Task 3: Display — section headers + target weight in Plan/History/Runner

**Files:** `src/app/workouts/[id]/page.tsx`, `src/components/SessionRunner.tsx`

**Interfaces:** Consumes `formatTargetWeight` + `RunnerExercise.targetWeight` (Task 1).

- [ ] **Step 1: Plan grouped by section, with target weight**

In `src/app/workouts/[id]/page.tsx`, import `formatTargetWeight`. In the Plan `<section>`, replace the flat `blocks.map` with section-grouped rendering: walk blocks in order; the section for a block is `block.exercises[0]?.sectionName ?? null`; render a section header (small uppercase muted) whenever the section changes to a non-null value:

```tsx
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
```

- [ ] **Step 2: History section header rows**

In the history `<tbody>`, before each exercise row whose section differs from the previous exercise's section, emit a header row spanning all columns:

```tsx
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
                        {/* ...existing exercise row cells unchanged... */}
                      </tr>
                    </Fragment>
                  );
                })}
```

Import `Fragment` from `react`. Move the existing `<tr>...</tr>` body inside the `<Fragment>` (do not change the cells). `exercisesInOrder` items are `Exercise` rows which include `sectionName`.

- [ ] **Step 3: Runner — target-weight prefill + target chip**

In `src/components/SessionRunner.tsx`:
- Import `formatTargetWeight`.
- In the weight seed line, insert `targetWeight` before the previous-session fallback:
  `setWeight(\`${existing?.weight ?? step.exercise.targetWeight ?? prev?.weight ?? lastWeightThisSession ?? ""}\`);`
- In the target chip (currently `Target {formatTarget(step.exercise)}`), append the target weight when present:
  `Target {formatTarget(step.exercise)}{step.exercise.targetWeight != null ? ` · ${formatTargetWeight(step.exercise)}` : ""}`

- [ ] **Step 4: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint`.
Commit: `git add -A && git commit -m "feat: section headers in plan/history and target-weight prefill in runner"`

---

### Task 4: End-to-end verification

- [ ] **Step 1: Static gates** — `npm test && npx tsc --noEmit && npm run lint && npm run build` all green.

- [ ] **Step 2: Authenticated runtime (controller drives)**

1. Edit a variation: set two exercises to section "Pecs", two to "Biceps", give one a target weight of 60 kg — save.
2. Detail Plan: shows "PECS" and "BICEPS" headers grouping the right exercises; the exercise with a target shows "· 60 kg".
3. History table: shows the section header rows above the right exercises.
4. Start that variation: the runner pre-fills 60 kg for that exercise and the target chip reads "… · 60 kg".

- [ ] **Step 3: Commit any fixes** — `git add -A && git commit -m "fix: stage 3 polish from verification"` (only if needed).
