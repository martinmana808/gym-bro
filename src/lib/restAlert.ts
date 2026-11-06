"use client";

import { ALARM_VOLUME_KEY, DEFAULT_ALARM_VOLUME, clampVolume, needsResume } from "./alarm";

let ctx: AudioContext | null = null;
let recoveryInstalled = false;

// This device's alarm loudness. Per-device on purpose: the phone lives in a
// gym bag, the laptop doesn't. Cached so it can back a useSyncExternalStore
// snapshot without hitting localStorage on every render.
let volumeCache: number | null = null;
const volumeListeners = new Set<() => void>();

export function getAlarmVolume(): number {
  if (volumeCache != null) return volumeCache;
  try {
    const stored = localStorage.getItem(ALARM_VOLUME_KEY);
    volumeCache = stored == null ? DEFAULT_ALARM_VOLUME : clampVolume(stored);
  } catch {
    volumeCache = DEFAULT_ALARM_VOLUME;
  }
  return volumeCache;
}

/** The server has no localStorage, so it renders the default and hydrates. */
export const getServerAlarmVolume = () => DEFAULT_ALARM_VOLUME;

export function subscribeAlarmVolume(onChange: () => void) {
  volumeListeners.add(onChange);
  return () => volumeListeners.delete(onChange);
}

export function setAlarmVolume(volume: number) {
  volumeCache = clampVolume(volume);
  try {
    localStorage.setItem(ALARM_VOLUME_KEY, String(volumeCache));
  } catch {
    // private mode — the alarm just stays at whatever this tab had
  }
  volumeListeners.forEach((l) => l());
}

/**
 * iOS parks the AudioContext in "interrupted" the moment the screen locks, and
 * leaves it there for good. That is why the alarm used to die after the first
 * rest you spent with the phone in a pocket. Take every chance to bring it
 * back: when the page is shown again, and on the next tap, since a resume
 * outside a user gesture can still be refused.
 */
function installRecovery() {
  if (recoveryInstalled || typeof document === "undefined") return;
  recoveryInstalled = true;
  const wake = () => {
    if (ctx && needsResume(ctx.state)) void ctx.resume().catch(() => {});
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
  document.addEventListener("pointerdown", wake, { passive: true });
}

/** Call from a user gesture (e.g. Log set) so iOS allows sound later. */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    installRecovery();
    if (needsResume(ctx.state)) void ctx.resume().catch(() => {});
  } catch {
    // no WebAudio — vibration may still work
  }
}

/** Whether a beep would actually be audible right now. */
export function audioArmed(): boolean {
  return ctx != null && ctx.state === "running";
}

/** One beep: a square wave carries much further in a noisy gym than a sine. */
function beep(at: number, duration: number, volume: number) {
  if (!ctx) return;
  // exponentialRamp can't touch zero, so ramp from just under the target.
  const floor = Math.max(1e-5, Math.min(0.0001, volume / 100));
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(floor, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.setValueAtTime(volume, at + duration - 0.05);
  gain.gain.exponentialRampToValueAtTime(floor, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** Three long beeps — the phone is usually in a pocket across the gym floor. */
function playBeeps(volume: number) {
  if (!ctx || ctx.state !== "running" || volume <= 0) return;
  const t0 = ctx.currentTime;
  beep(t0, 0.45, volume);
  beep(t0 + 0.6, 0.45, volume);
  beep(t0 + 1.2, 0.7, volume);
}

/** Vibrate + beep when the rest timer hits zero. */
export function restAlert(volume: number = getAlarmVolume()) {
  try {
    navigator.vibrate?.([400, 150, 400, 150, 600]);
  } catch {}
  if (!ctx) return;
  if (needsResume(ctx.state)) {
    // Interrupted by a screen lock. Resuming may well be allowed now that we're
    // back in the foreground — beep as soon as it lands rather than giving up.
    void ctx
      .resume()
      .then(() => playBeeps(volume))
      .catch(() => {});
    return;
  }
  playBeeps(volume);
}
