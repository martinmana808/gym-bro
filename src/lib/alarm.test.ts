import { describe, expect, it } from "vitest";
import { DEFAULT_ALARM_VOLUME, clampVolume, needsResume } from "./alarm";

describe("needsResume", () => {
  it("leaves a running context alone", () => {
    expect(needsResume("running")).toBe(false);
  });

  it("resumes a suspended context", () => {
    expect(needsResume("suspended")).toBe(true);
  });

  // The bug this was written for: locking an iPhone parks the AudioContext in
  // WebKit's non-standard "interrupted" state, and it never leaves on its own.
  // Only checking for "suspended" meant the rest alarm went silent for the
  // whole session after the first time the phone went in a pocket.
  it("resumes a context iOS interrupted on screen lock", () => {
    expect(needsResume("interrupted")).toBe(true);
  });

  it("treats a closed context as needing attention", () => {
    expect(needsResume("closed")).toBe(true);
  });
});

describe("clampVolume", () => {
  it("keeps a sane value", () => {
    expect(clampVolume(0.5)).toBe(0.5);
  });

  it("clamps out of range values", () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
  });

  it("falls back to the default for junk", () => {
    expect(clampVolume("loud")).toBe(DEFAULT_ALARM_VOLUME);
    expect(clampVolume(null)).toBe(DEFAULT_ALARM_VOLUME);
    expect(clampVolume(NaN)).toBe(DEFAULT_ALARM_VOLUME);
  });

  it("accepts a numeric string, as a range input gives", () => {
    expect(clampVolume("0.25")).toBe(0.25);
  });

  it("allows silence", () => {
    expect(clampVolume(0)).toBe(0);
  });
});
