"use client";

import { useState } from "react";
import { usePush } from "@/lib/usePush";

/** Card on the workouts list: turn rest-timer notifications on for this phone. */
export function NotificationSettings() {
  const push = usePush();
  const [sent, setSent] = useState(false);

  if (push.needsInstall) {
    return (
      <Card>
        <Title>Rest timer notifications</Title>
        <p className="mt-1 text-sm text-zinc-400">
          iOS only allows notifications once Gym Bro is on your home screen. Tap{" "}
          <span className="text-zinc-200">Share ⎋</span> →{" "}
          <span className="text-zinc-200">Add to Home Screen</span>, then open it from there.
        </p>
      </Card>
    );
  }

  if (!push.supported) return null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Title>Rest timer notifications</Title>
          <p className="mt-1 text-sm text-zinc-400">
            {push.subscribed
              ? "This phone gets a buzz when your rest is up, even with the app closed."
              : "Get a buzz when rest is up, even if you've switched apps."}
          </p>
        </div>
        <button
          onClick={() => {
            setSent(false);
            void (push.subscribed ? push.disable() : push.enable());
          }}
          disabled={push.busy}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
            push.subscribed
              ? "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
              : "bg-lime-400 text-zinc-950 hover:bg-lime-300"
          }`}
        >
          {push.busy ? "…" : push.subscribed ? "Turn off" : "Turn on"}
        </button>
      </div>

      {push.subscribed && (
        <button
          onClick={async () => setSent(await push.sendTest())}
          className="mt-3 text-sm text-zinc-500 transition hover:text-lime-400"
        >
          {sent ? "Sent — check your lock screen" : "Send a test notification"}
        </button>
      )}
      {push.error && <p className="mt-3 text-sm text-red-400">{push.error}</p>}
    </Card>
  );
}

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">{children}</div>
);

const Title = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-semibold tracking-tight">{children}</h2>
);
