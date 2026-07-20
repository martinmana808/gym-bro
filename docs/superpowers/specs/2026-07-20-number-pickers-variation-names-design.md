# Number Pickers (native dropdowns) + Variation Names

**Date:** 2026-07-20
**Status:** Approved design (user: "GO AHEAD. YOLO")

## Context

On iPhone, a native `<select>` element renders as the iOS spinning-wheel
bottom-sheet picker; on Android/desktop it renders as a normal dropdown. The
app currently uses typed number `<input>` fields everywhere. Replacing those
with `<select>`s (pre-filled with the sensible range of choices per field) gives
the user the iOS wheel "for free" — no custom component, no typing — which is
exactly what they asked for.

Bundled in: rename a variation from the edit page, and default the first
variation to "Week 1" (not "Base").

## Goals

1. Replace number inputs with native `<select>` pickers across the builder,
   the runner, and the finished-session set editor.
2. Per-field ranges/steps (below), a blank "—" for optional fields, and always
   include the current stored value as a choice even if it's off-step (no data
   loss on edit).
3. Rename a variation on the edit page (next to the variation tabs).
4. New workouts/imports name the first variation "Week 1"; each added variation
   is "Week N".

## Non-goals

- No custom scroll-wheel component (native `<select>` is the whole mechanism).
- No change to the OK button or range quick-tap buttons in the runner (they stay
  as the fast path; the picker replaces only the manual typed entry / +/- stepper).

## The picker component

`NumberSelect` (client, `src/components/NumberSelect.tsx`):

```
NumberSelect({
  value: string,                 // current value as a string ("" = blank)
  onChange: (v: string) => void,
  min: number, max: number, step: number,
  blank?: boolean,               // include a "—" option (default false)
  blankLabel?: string,           // default "—"
  className?: string,            // defaults to the shared `field` class
}): JSX.Element
```

- Renders a native `<select>` styled with the app's `field` class (dark, rounded).
  iOS shows the wheel; other platforms show a dropdown.
- Options: `min, min+step, … max` as strings (numbers formatted without trailing
  `.0`; `trimNumber`-style). Prepend the blank option when `blank`.
- **Off-step safety:** if `value` is non-blank and not already among the
  generated options, insert it (sorted) so the current value is always
  selectable and never silently dropped.
- Value semantics stay strings to match existing field state; callers convert to
  number/null at their existing boundaries (same as they do today for inputs).

## Field ranges

| Field (where) | min | max | step | blank |
|---|---|---|---|---|
| Sets (builder) | 1 | 10 | 1 | no |
| Reps – fixed, and From/To of a range (builder) | 1 | 50 | 1 | no |
| Target weight – kg (builder) | 0 | 300 | 2.5 | yes |
| Target weight – bricks (builder) | 1 | 25 | 1 | yes |
| Duration seconds – time exercise (builder) | 5 | 300 | 5 | no |
| Rest override seconds (builder) | 0 | 300 | 5 | yes (= default) |
| Default rest seconds (builder) | 0 | 300 | 5 | no |
| Weight – kg (runner, set editor) | 0 | 300 | 2.5 | yes |
| Weight – bricks (runner, set editor) | 1 | 25 | 1 | yes |
| Reps (runner, set editor) | 0 | 60 | 1 | no |
| Seconds (runner, set editor) | 5 | 300 | 5 | no |

The kg-vs-bricks range/step is chosen from the exercise's `weightUnit`.

## Where it replaces existing inputs

- `src/components/WorkoutBuilder.tsx`: sets, target weight, reps (fixed), range
  From/To, duration, rest override, default rest.
- `src/components/SessionRunner.tsx`: the `NumberField` weight/reps/seconds inputs
  become `NumberSelect`. The OK button and range quick-taps are unchanged. The
  `NumberField` component (with its +/- steppers) is removed if it has no other
  users.
- `src/components/FinishedSets.tsx` (`SetEditor`): weight/reps/seconds become
  `NumberSelect` (imported from the shared component instead of `NumberField`).

## Variation names

- **Edit page** (`src/app/workouts/[id]/edit/page.tsx`): add an editable
  "Variation name" — a small client control (form calling `renameVariation`)
  placed with the variation tabs, prefilled with the active variation's name.
  (Alternatively fold the name into the builder's save via `updateVariation`;
  the standalone rename control is simpler and reuses the existing
  `renameVariation` action.)
- **Default name:** `createWorkout` and `importProgram` create the first
  variation as `"Week 1"` (was `"Base"`). `createVariation` names the new one
  `"Week ${count + 1}"` (was `"<source> copy"`).

## Error handling / edge cases

- Off-step stored values are always included as options (no data loss).
- Blank selection maps to `null`/`""` exactly as the current inputs do.
- Existing "Base" variations already in a database are left as-is (the default
  only affects newly created ones); the production DB is currently empty, so this
  is moot there.

## Testing

- Unit: the option-list generator (range + step + blank + off-step inclusion) —
  e.g. kg 0..300/2.5 includes 22.5 and a stray 63; sets 1..10; blank first.
- Manual (iPhone via the deployed PWA): tapping a field opens the iOS wheel;
  picking a value updates it; saving persists; range From/To and rest/duration
  wheels show the right choices; renaming a variation works; a new workout's
  first variation is "Week 1".

## Rollout

Build, verify, commit, then deploy to production (`vercel deploy --prod`) so it's
testable on the phone.
