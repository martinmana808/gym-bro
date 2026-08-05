// Pure helpers shared by the rest-alert client and the push route.

/** A Vercel function can run 300s; leave headroom for the push round-trip. */
export const MAX_REST_PUSH_SECONDS = 290;

/** Clamp a client-supplied rest length into something we can actually sleep. */
export function clampRestSeconds(seconds: number): number {
  const n = Math.round(Number(seconds));
  if (Number.isNaN(n)) return 1; // Infinity still clamps to the max below
  return Math.min(MAX_REST_PUSH_SECONDS, Math.max(1, n));
}

/** The notification the phone shows when the rest timer hits zero. */
export function restNotification(nextExercise: string | null, sessionId?: string | null) {
  const name = (nextExercise ?? "").trim().slice(0, 70);
  return {
    title: "Rest over 💪",
    body: name ? `Next up: ${name}` : "Back to it.",
    tag: "rest",
    url: sessionId ? `/sessions/${sessionId}` : "/",
  };
}
