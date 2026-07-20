# Number Pickers + Variation Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace typed number inputs with native `<select>` pickers (iOS renders these as the wheel) across the builder, runner, and set editor; add per-field ranges; let users rename a variation on the edit page; default the first variation to "Week 1".

**Spec:** `docs/superpowers/specs/2026-07-20-number-pickers-variation-names-design.md`

## Global Constraints

- Native `<select>` only — no custom wheel. Values stay strings at the field boundary (matches current input state).
- Off-step stored values must always appear as an option (no data loss).
- Blank "—" option only where the field is optional (target weight, rest override).
- Ranges: sets 1–10/1; reps fixed & range from/to 1–50/1; kg weight 0–300/2.5; bricks 1–25/1; duration 5–300/5; rest override 0–300/5 (blank); default rest 0–300/5; runner reps 0–60/1; runner seconds 5–300/5.
- Verify `npm test`, `npx tsc --noEmit`, `npm run lint` before each commit. Commit every task. Deploy is done by the controller after.
- Dev server / prod server are controller-managed — do not start one.

---

### Task 1: `numberOptions` (TDD) + `NumberSelect` component

**Files:** `src/lib/workout.ts`, `src/lib/workout.test.ts`, `src/components/NumberSelect.tsx`

- [ ] **Step 1: Test the generator** — append to `src/lib/workout.test.ts`:

```ts
import { numberOptions } from "./workout";
describe("numberOptions", () => {
  it("generates an inclusive range by step, trimmed", () => {
    expect(numberOptions(0, 10, 2.5)).toEqual(["0", "2.5", "5", "7.5", "10"]);
    expect(numberOptions(1, 5, 1)).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("has no float drift at 2.5 steps", () => {
    expect(numberOptions(0, 300, 2.5)).toContain("22.5");
    expect(numberOptions(0, 300, 2.5)).toContain("300");
    expect(numberOptions(0, 300, 2.5).some((o) => o.includes("."))).toBe(true);
    expect(numberOptions(0, 300, 2.5).every((o) => Number.isFinite(Number(o)))).toBe(true);
  });
  it("includes an off-step current value, sorted in", () => {
    const opts = numberOptions(0, 300, 2.5, { current: "63" });
    expect(opts).toContain("63");
    expect(opts.indexOf("63")).toBeGreaterThan(opts.indexOf("62.5"));
    expect(opts.indexOf("63")).toBeLessThan(opts.indexOf("65"));
  });
  it("ignores a current value that is blank or already present", () => {
    expect(numberOptions(1, 10, 1, { current: "" })).toEqual(numberOptions(1, 10, 1));
    expect(numberOptions(1, 10, 1, { current: "5" })).toEqual(numberOptions(1, 10, 1));
  });
});
```

- [ ] **Step 2: Run → RED** (`npm test`).

- [ ] **Step 3: Implement `numberOptions`** in `src/lib/workout.ts` (reuse the existing `trimNumber`):

```ts
/** Option values for a NumberSelect: min..max inclusive by step, trimmed of
 * trailing zeros; an off-step `current` value is inserted (sorted) so a saved
 * value is never dropped. */
export function numberOptions(
  min: number,
  max: number,
  step: number,
  opts?: { current?: string },
): string[] {
  const out: string[] = [];
  const decimals = (`${step}`.split(".")[1] ?? "").length;
  for (let v = min; v <= max + 1e-9; v += step) {
    out.push(trimNumber(Number(v.toFixed(decimals))));
  }
  const cur = opts?.current;
  if (cur && cur.trim() !== "" && Number.isFinite(Number(cur)) && !out.includes(cur)) {
    out.push(cur);
    out.sort((a, b) => Number(a) - Number(b));
  }
  return out;
}
```

(Ensure `trimNumber` is exported or accessible; it already lives in this file. If it's not exported, no change needed since `numberOptions` is in the same module.)

- [ ] **Step 4: `NumberSelect` component** — `src/components/NumberSelect.tsx`:

```tsx
"use client";

import { numberOptions } from "@/lib/workout";

const selectField =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-zinc-100 " +
  "transition focus:border-lime-400 focus:outline-none";

/** A native <select> number picker. On iOS this renders as the wheel; elsewhere
 * a dropdown. Value is a string ("" = blank). */
export function NumberSelect({
  value,
  onChange,
  min,
  max,
  step,
  blank = false,
  blankLabel = "—",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  blank?: boolean;
  blankLabel?: string;
  className?: string;
}) {
  const options = numberOptions(min, max, step, { current: value });
  return (
    <select
      className={className ?? selectField}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {blank && <option value="">{blankLabel}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 5:** `npm test && npx tsc --noEmit && npm run lint`; commit:
`git add src/lib/workout.ts src/lib/workout.test.ts src/components/NumberSelect.tsx && git commit -m "feat: numberOptions + NumberSelect native picker"`

---

### Task 2: Wire `NumberSelect` into builder, runner, set editor

**Files:** `src/components/WorkoutBuilder.tsx`, `src/components/SessionRunner.tsx`, `src/components/FinishedSets.tsx`; remove `src/components/NumberField.tsx` if unused after.

**Interfaces:** Consumes `NumberSelect` (Task 1). Value stays string; the existing `patchExercise`/state `onChange` handlers already take strings or `Number(...)` them — keep each call site's existing conversion (e.g. `onChange={(v) => patchExercise(bi, ei, { sets: Number(v) })}`).

- [ ] **Step 1: Builder** — in `WorkoutBuilder.tsx`, replace each number `<input>` with `<NumberSelect>` (import it), keeping the surrounding `<label><span>…</span> … </label>`:
  - Sets → `min={1} max={10} step={1}`, `value={`${e.sets}`}` , `onChange={(v)=>patchExercise(bi,ei,{sets:Number(v)})}`.
  - Default rest (top of form) → `min={0} max={300} step={5}`, `value={`${rest}`}`, `onChange={(v)=>setRest(Number(v))}`.
  - Target weight → `min/max/step` from unit: kg `{0,300,2.5}`, bricks `{1,25,1}`; `blank`; `value={e.targetWeight==null?"":`${e.targetWeight}`}`, `onChange={(v)=>patchExercise(bi,ei,{targetWeight:v===""?null:Number(v)})}`.
  - Reps (fixed) → `{1,50,1}`, `value={e.repsMin==null?"":`${e.repsMin}`}`, `onChange={(v)=>patchExercise(bi,ei,{repsMin:Number(v)})}`.
  - Range From (repsMin) and To (repsMax) → `{1,50,1}` each.
  - Duration (time) → `{5,300,5}`, `value={e.timeSeconds==null?"":`${e.timeSeconds}`}`.
  - Rest override → `{0,300,5}`, `blank`, `value={e.restOverrideSeconds==null?"":`${e.restOverrideSeconds}`}`, `onChange={(v)=>patchExercise(bi,ei,{restOverrideSeconds:v===""?null:Number(v)})}`.
  Remove the `type="number"`/`inputMode`/`step` input attributes (they become NumberSelect props).

- [ ] **Step 2: Runner** — in `SessionRunner.tsx`, replace the three `NumberField` usages with a labelled `NumberSelect`. Keep the existing label text; e.g. for weight:
```tsx
<label className="flex flex-col gap-1.5">
  <span className="text-sm text-zinc-400">{unit === "bricks" ? "Weight (bricks)" : "Weight (kg)"}</span>
  <NumberSelect
    value={weight}
    onChange={setWeight}
    min={unit === "bricks" ? 1 : 0}
    max={unit === "bricks" ? 25 : 300}
    step={unit === "bricks" ? 1 : 2.5}
    blank
  />
</label>
```
Reps → `{0,60,1}` (`value={reps} onChange={setReps}`). Seconds → `{5,300,5}` (`value={seconds} onChange={setSeconds}`). The OK button and range quick-taps are unchanged. Remove the `NumberField` import.

- [ ] **Step 3: SetEditor** — in `FinishedSets.tsx`, replace `NumberField` with `NumberSelect` (weight `{0,300,2.5}`/bricks `{1,25,1}` `blank`; reps `{0,60,1}`; seconds `{5,300,5}`), matching how the runner does it. Update the import.

- [ ] **Step 4: Remove `NumberField.tsx`** if `grep -rn "NumberField" src` shows no remaining users. Then `npm test && npx tsc --noEmit && npm run lint`; commit:
`git add -A && git commit -m "feat: use NumberSelect pickers in builder, runner, set editor"`

---

### Task 3: Variation names — editable + "Week 1" default

**Files:** `src/app/actions.ts`, `src/app/workouts/[id]/edit/page.tsx`, `src/components/VariationNameField.tsx` (new)

- [ ] **Step 1: Defaults** in `src/app/actions.ts`:
  - `createWorkout`: the first variation's `name: "Base"` → `name: "Week 1"`.
  - `importProgram`: the variation `name: "Base"` → `name: "Week 1"`.
  - `createVariation`: change the new name from `` `${source.name} copy` `` to `` `Week ${siblings.length + 1}` ``.

- [ ] **Step 2: Rename control** — `src/components/VariationNameField.tsx`:

```tsx
"use client";

import { useState } from "react";
import { renameVariation } from "@/app/actions";

export function VariationNameField({ variationId, name }: { variationId: string; name: string }) {
  const [value, setValue] = useState(name);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-zinc-400">Variation name</span>
      <input
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-zinc-100 transition focus:border-lime-400 focus:outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() && value !== name && renameVariation(variationId, value)}
        placeholder="Week 1"
      />
    </label>
  );
}
```

- [ ] **Step 3: Place it on the edit page** — in `src/app/workouts/[id]/edit/page.tsx`, render `<VariationNameField variationId={variationId} name={variation.name} />` right under the variation tabs block (import it). (`variation` is already destructured from `structure`.)

- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint`; commit:
`git add -A && git commit -m "feat: rename a variation on the edit page; default first variation to Week 1"`

---

### Task 4: Verify

- [ ] `npm test && npx tsc --noEmit && npm run lint && npm run build` all green. Controller drives the runtime + deploy.
