"use client";

let ctx: AudioContext | null = null;

/** Call from a user gesture (e.g. Log set) so iOS allows sound later. */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // no WebAudio — vibration may still work
  }
}

/** One beep: a square wave carries much further in a noisy gym than a sine. */
function beep(at: number, duration: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.9, at + 0.015);
  gain.gain.setValueAtTime(0.9, at + duration - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/**
 * Vibrate + beep when the rest timer hits zero. Three long beeps rather than
 * one short one — the phone is usually in a pocket across the gym floor.
 */
export function restAlert() {
  try {
    navigator.vibrate?.([400, 150, 400, 150, 600]);
  } catch {}
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  beep(t0, 0.45);
  beep(t0 + 0.6, 0.45);
  beep(t0 + 1.2, 0.7);
}
