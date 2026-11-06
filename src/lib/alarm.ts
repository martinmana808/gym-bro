// Pure helpers for the rest alarm. Kept free of browser globals so the rules
// that matter — when to resume audio, how loud to be — are unit-testable.

export const DEFAULT_ALARM_VOLUME = 0.9;
export const ALARM_VOLUME_KEY = "sharp.alarmVolume";

/**
 * Whether the AudioContext has to be resumed before it can make a sound.
 *
 * The important case is iOS. Locking the phone — which is exactly what happens
 * when you pocket it during a rest — parks the context in WebKit's
 * non-standard "interrupted" state, and it does not come back on its own.
 * Anything that is not "running" needs a resume, so don't special-case names.
 */
export function needsResume(state: string): boolean {
  return state !== "running";
}

/** A 0–1 gain, forgiving about what the settings slider hands over. */
export function clampVolume(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_ALARM_VOLUME;
  return Math.min(1, Math.max(0, n));
}
