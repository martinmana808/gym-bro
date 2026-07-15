# Gym Bro Stage 4: Fast Entry (OK + Range Quick-Taps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Speed up logging. For a **fixed**-rep exercise, an **OK** button logs "hit the target exactly" in one tap. For a **range** exercise (e.g. 10–12), tappable rep buttons (`10 · 11 · 12`) log a value in one tap. Both are still overridable by typing or the +/− ticker; to-failure and time exercises get no suggestions.

**Architecture:** The `set_logs.hit_target` boolean already exists (Stage 1). This stage wires it through: `logSet` accepts `hitTarget`; the runner's submit path takes an override (`{ reps, ok }`) so OK/quick-tap buttons are one-tap logs; the domain formatters render `"OK"` for hit-target sets; and the display surfaces (dense history, session summary, last-time chip, set grid) pass `hitTarget` through so `"OK"` shows.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-gym-bro-programs-variations-design.md` (Stage 4).

## Global Constraints

- **OK semantics:** only for `fixed` reps exercises. Logging OK stores `reps = repsMin` (the target, snapshotted) and `hitTarget = true`. Display shows `"OK"` in place of the rep count.
- **Range quick-taps:** only for `range` reps exercises — one button per integer `repsMin..repsMax`; tapping logs that rep count with `hitTarget = false`.
- **No suggestions** for `failure` reps or `time` exercises (they keep the manual field + Log set).
- All quick actions are one-tap **logs** (fill + submit); the manual reps field + "Log set" button remain as the override path.
- `hitTarget` is optional on `LoggedSet`/`SetEntry` (default/absent = false) so existing callers stay compatible.
- No schema migration (`hit_target` column already exists). Ownership unchanged (`logSet` already authorizes).
- Verification: `npm test`, `npx tsc --noEmit`, `npm run lint` pass before every commit; commit every task. Dev server controller-owned (port 3000).

## File structure

- `src/lib/workout.ts` — `LoggedSet`/`SetEntry` gain `hitTarget?`; `formatLoggedSet`/`formatSessionCell` render `"OK"`.
- `src/app/actions.ts` — `LogSetInput.hitTarget?`; `logSet` persists it (insert + conflict update).
- `src/components/SessionRunner.tsx` — `submitSet` override; OK button + range quick-taps.
- `src/components/SetGrid.tsx` — grid cell shows `"OK"` for hit-target entries.
- `src/app/sessions/[id]/page.tsx` + `src/components/FinishedSets.tsx` — `toEntry` maps `hitTarget` so the summary/edit views show `"OK"`.

---

### Task 1: Domain — `hitTarget` + `"OK"` rendering + `logSet`

**Files:** `src/lib/workout.ts`, `src/lib/workout.test.ts`, `src/app/actions.ts`

**Interfaces (Produces):**
- `LoggedSet` and `SetEntry` gain `hitTarget?: boolean`.
- `formatLoggedSet(l, unit)`: when `l.hitTarget`, the reps portion is `"OK"` (`"60×OK"` weighted, `"OK"` bodyweight; time exercises ignore hitTarget).
- `formatSessionCell(logs, ...)`: the reps portion of a hit-target set is `"OK"`.
- `LogSetInput.hitTarget?: boolean`; `logSet` persists it.

- [ ] **Step 1: Tests first**

In `src/lib/workout.test.ts`, add:

```ts
describe("hit-target (OK) rendering", () => {
  it("formatLoggedSet shows OK for a hit-target set", () => {
    expect(formatLoggedSet({ setNumber: 1, weight: 60, reps: 8, timeSeconds: null, hitTarget: true }, "kg")).toBe("60×OK");
    expect(formatLoggedSet({ setNumber: 1, weight: null, reps: 12, timeSeconds: null, hitTarget: true })).toBe("OK");
    expect(formatLoggedSet({ setNumber: 1, weight: 60, reps: 8, timeSeconds: null, hitTarget: false }, "kg")).toBe("60×8");
  });
  it("formatSessionCell shows OK in the reps position for hit-target sets", () => {
    const set = (setNumber: number, reps: number, hitTarget: boolean) => ({ setNumber, weight: 60, reps, timeSeconds: null, hitTarget });
    expect(formatSessionCell([set(1, 8, true), set(2, 8, true), set(3, 6, false)], "kg", 60)).toBe("OK·OK·6");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test`): `hitTarget` not on the type / not rendered.

- [ ] **Step 3: Implement**

`src/lib/workout.ts`:
- Add `hitTarget?: boolean;` to `LoggedSet` and to `SetEntry`.
- `formatLoggedSet`:
```ts
export function formatLoggedSet(l: LoggedSet, unit: WeightUnit = "kg"): string {
  if (l.timeSeconds != null) return formatSeconds(l.timeSeconds);
  const reps = l.hitTarget ? "OK" : `${l.reps ?? "?"}`;
  if (l.weight != null) return `${formatWeight(l.weight, unit)}×${reps}`;
  return reps;
}
```
- `formatSessionCell`: change the reps push to honor hitTarget:
```ts
    parts.push(
      l.timeSeconds != null ? formatSeconds(l.timeSeconds) : l.hitTarget ? "OK" : `${l.reps ?? "?"}`,
    );
```

`src/app/actions.ts`:
- `LogSetInput`: add `hitTarget?: boolean;`
- In `logSet`, add `hitTarget: input.hitTarget ?? false,` to `values`, and add `hitTarget: values.hitTarget` to the `onConflictDoUpdate` `set`.

- [ ] **Step 4: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint` — new tests pass; existing green.
Commit: `git add src/lib/workout.ts src/lib/workout.test.ts src/app/actions.ts && git commit -m "feat: hit-target (OK) model + rendering + logSet persistence"`

---

### Task 2: Runner — OK button, range quick-taps, grid OK

**Files:** `src/components/SessionRunner.tsx`, `src/components/SetGrid.tsx`

**Interfaces:** Consumes Task 1 (`hitTarget` on `LogEntry`/`SetEntry`, `logSet` accepts it).

- [ ] **Step 1: Submit override**

In `SessionRunner.tsx`, change `submitSet` to accept an override and set `hitTarget`:

```ts
  const submitSet = async (over?: { reps?: number; ok?: boolean }) => {
    primeAudio();
    if (!step) return;
    const isTime = step.exercise.measurement === "time";
    const repsValue = over?.reps ?? (reps === "" ? null : Number(reps));
    const entry: LogEntry = {
      exerciseId: step.exercise.id,
      setNumber: step.setNumber,
      weight: weight === "" ? null : Number(weight),
      reps: isTime ? null : repsValue,
      timeSeconds: isTime && seconds !== "" ? Number(seconds) : null,
      hitTarget: over?.ok ?? false,
    };
    setSaving(true);
    setError(null);
    try {
      await logSet({ sessionId, ...entry });
    } catch {
      setError("Could not save this set — check your connection and try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setLogs((m) => new Map(m).set(logKey(entry.exerciseId, entry.setNumber), entry));
    const flatIndex = steps.indexOf(step);
    const next = steps[flatIndex + 1];
    if (next?.kind === "rest") {
      setResting({ endsAt: Date.now() + next.seconds * 1000, total: next.seconds });
    }
    if (setIndex < setSteps.length - 1) setSetIndex(setIndex + 1);
  };
```

The existing "Log set" button's `onClick={submitSet}` still works (called with no args → override undefined → manual reps, hitTarget false). NOTE: `onClick={submitSet}` passes a React event as the first arg; change it to `onClick={() => submitSet()}` so the event isn't mistaken for an override object.

- [ ] **Step 2: Quick-entry row (OK / range buttons)**

In the reps branch of the field area (where `measurement === "reps"`), above or below the reps `NumberField`, add a quick-entry row driven by the exercise's rep scheme:

```tsx
                {step.exercise.measurement === "reps" && (
                  <div className="flex flex-wrap gap-2">
                    {step.exercise.repScheme === "fixed" && step.exercise.repsMin != null && (
                      <button
                        type="button"
                        onClick={() => submitSet({ reps: step.exercise.repsMin!, ok: true })}
                        disabled={saving}
                        className="rounded-xl bg-lime-400/15 px-4 py-2 text-sm font-semibold text-lime-400 transition hover:bg-lime-400/25 disabled:opacity-50"
                      >
                        OK ({step.exercise.repsMin})
                      </button>
                    )}
                    {step.exercise.repScheme === "range" &&
                      step.exercise.repsMin != null &&
                      step.exercise.repsMax != null &&
                      Array.from(
                        { length: Math.max(0, step.exercise.repsMax - step.exercise.repsMin + 1) },
                        (_, i) => step.exercise.repsMin! + i,
                      )
                        .slice(0, 12)
                        .map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => submitSet({ reps: r })}
                            disabled={saving}
                            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50"
                          >
                            {r}
                          </button>
                        ))}
                  </div>
                )}
```

Place this block just before the "Log set" button (so the fast path sits above the manual submit). Keep the reps `NumberField` and the "Log set" button as the manual override.

- [ ] **Step 3: SetGrid shows OK**

In `src/components/SetGrid.tsx`, the cell content computes `${formatWeight(...)}×${reps}`. Change the reps portion to `entry.hitTarget ? "OK" : (entry.reps ?? "?")`:

```tsx
                        {entry
                          ? entry.timeSeconds != null
                            ? formatSeconds(entry.timeSeconds)
                            : entry.weight != null
                              ? `${formatWeight(entry.weight, e.weightUnit)}×${entry.hitTarget ? "OK" : (entry.reps ?? "?")}`
                              : entry.hitTarget
                                ? "OK"
                                : `${entry.reps ?? "?"}`
                          : "·"}
```

- [ ] **Step 4: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint`.
Commit: `git add -A && git commit -m "feat: OK button and range quick-tap logging in the runner"`

---

### Task 3: Wire `hitTarget` through the summary/edit views

**Files:** `src/app/sessions/[id]/page.tsx`, `src/components/FinishedSets.tsx`

**Interfaces:** Consumes Task 1/2 (`SetEntry.hitTarget`).

- [ ] **Step 1: `toEntry` maps `hitTarget`**

In BOTH `src/app/sessions/[id]/page.tsx` (its `toEntry`) and `src/components/FinishedSets.tsx` (wherever a log/entry is mapped), add `hitTarget: l.hitTarget` to the produced `SetEntry`. The DB `SetLog` rows include `hitTarget` (Stage 1 column), and the runner's `initialLogs`/`previousLogs` and the finished-session `initialEntries` all flow through these maps, so the last-time chip, dense history, session summary, and edit grid then render `"OK"`.

If `FinishedSets`'s `SetEditor` has no OK control, that's fine for Stage 4 (editing a finished set to "OK" is out of scope) — just ensure existing hit-target sets DISPLAY as "OK" in the read view via `formatLoggedSet(l, e.weightUnit)`.

- [ ] **Step 2: Verify + commit**

`npm test && npx tsc --noEmit && npm run lint`; `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/workouts` → 307.
Commit: `git add -A && git commit -m "feat: show OK for hit-target sets in summary, history, and grid"`

---

### Task 4: End-to-end verification

- [ ] **Step 1: Static gates** — `npm test && npx tsc --noEmit && npm run lint && npm run build` green.

- [ ] **Step 2: Authenticated runtime (controller drives)**

1. A fixed-rep exercise shows an "OK (N)" button in the runner; tapping it advances to the next set and (on reload / in the grid) that set reads "OK".
2. A range exercise (set one to 10–12) shows buttons `10 11 12`; tapping `11` logs 11 and advances.
3. A to-failure and a time exercise show NO quick buttons (manual field only).
4. Finish the session; the summary and the workout History grid show "OK" in the hit-target set positions (e.g. `OK·OK·8`).

- [ ] **Step 3: Commit any fixes** — `git add -A && git commit -m "fix: stage 4 polish from verification"` (only if needed).
