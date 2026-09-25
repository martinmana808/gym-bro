import { describe, expect, it } from "vitest";
import { workoutAvatar } from "./avatar";

describe("workoutAvatar", () => {
  it("is stable for the same id", () => {
    expect(workoutAvatar("abc", "Pequeño Putarraco")).toEqual(
      workoutAvatar("abc", "Pequeño Putarraco"),
    );
  });

  it("gives different workouts different looks", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const looks = seeds.map((s) => workoutAvatar(s).background + workoutAvatar(s).glyph);
    expect(new Set(looks).size).toBeGreaterThan(5);
  });

  it("ignores the name when an id is present, so renaming keeps the avatar", () => {
    expect(workoutAvatar("abc", "One").background).toBe(workoutAvatar("abc", "Two").background);
  });

  it("takes initials from the first and last word", () => {
    expect(workoutAvatar("x", "Pequeño Putarraco").initials).toBe("PP");
    expect(workoutAvatar("x", "Upper").initials).toBe("UP");
    expect(workoutAvatar("x", "Push Pull Legs").initials).toBe("PL");
  });

  it("copes with no name at all", () => {
    expect(workoutAvatar("x", "").initials).toBe("??");
    expect(workoutAvatar("x", "   ").initials).toBe("??");
  });

  it("still produces something for an empty seed", () => {
    const a = workoutAvatar("", "");
    expect(a.glyph).toBeTruthy();
    expect(a.background).toContain("linear-gradient");
  });
});
