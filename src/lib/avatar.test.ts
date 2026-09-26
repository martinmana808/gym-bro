import { describe, expect, it } from "vitest";
import { ROSTER, workoutFighter } from "./avatar";

describe("workoutFighter", () => {
  it("is stable for the same id", () => {
    expect(workoutFighter("abc").slug).toBe(workoutFighter("abc").slug);
  });

  it("spreads workouts across the roster", () => {
    const slugs = new Set(
      Array.from({ length: 60 }, (_, i) => workoutFighter(`workout-${i}`).slug),
    );
    expect(slugs.size).toBeGreaterThan(5);
  });

  it("only ever returns someone from the roster", () => {
    const known = new Set(ROSTER.map((f) => f.slug));
    for (let i = 0; i < 50; i++) expect(known.has(workoutFighter(`w${i}`).slug)).toBe(true);
  });

  it("still picks someone for an empty id", () => {
    expect(workoutFighter("").name).toBeTruthy();
  });

  it("has a complete, unique roster", () => {
    expect(ROSTER).toHaveLength(9);
    expect(new Set(ROSTER.map((f) => f.slug)).size).toBe(9);
    for (const f of ROSTER) {
      expect(f.initials).toMatch(/^[A-Z]{2}$/);
      expect(f.background).toContain("gradient");
      expect(f.border).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
