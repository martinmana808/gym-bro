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

/** Vibrate + short beep when the rest timer hits zero. */
export function restAlert() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
  if (!ctx || ctx.state !== "running") return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
}
