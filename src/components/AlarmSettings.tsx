"use client";

import { useSyncExternalStore } from "react";
import {
  getAlarmVolume,
  getServerAlarmVolume,
  primeAudio,
  restAlert,
  setAlarmVolume,
  subscribeAlarmVolume,
} from "@/lib/restAlert";

/** How loud the end-of-rest beep is on this device, with a way to hear it. */
export function AlarmSettings() {
  // The setting lives in localStorage, which only exists on the client.
  const current = useSyncExternalStore(
    subscribeAlarmVolume,
    getAlarmVolume,
    getServerAlarmVolume,
  );
  const pct = Math.round(current * 100);

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold tracking-tight">Rest alarm volume</h2>
        <span className="display-num text-sm text-zinc-400">{pct === 0 ? "Silent" : `${pct}%`}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        The beep when your rest is up. The phone still vibrates at zero volume.
      </p>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={current}
        aria-label="Rest alarm volume"
        onChange={(e) => setAlarmVolume(Number(e.target.value))}
        // Dragging is a gesture, so it's also the moment iOS will let us open
        // the audio context — do it here and the first real alarm can sound.
        onPointerDown={() => primeAudio()}
        className="mt-4 w-full accent-lime-400"
      />

      <button
        onClick={() => {
          primeAudio();
          restAlert(current);
        }}
        className="btn btn-ghost mt-4 px-4 py-2 text-sm"
      >
        Test the alarm
      </button>
    </section>
  );
}
