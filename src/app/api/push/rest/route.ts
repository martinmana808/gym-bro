import { after } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";
import { sendPushToUser, pushEnabled } from "@/lib/push";
import { clampRestSeconds, restNotification } from "@/lib/restPush";

export const dynamic = "force-dynamic";
// The request sleeps out the rest timer, so it needs the full function budget.
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Schedule the "rest over" push. iOS has no local notification scheduling and
 * freezes JS timers in a backgrounded PWA, so the server holds the timer for us:
 * we answer immediately, then sleep in `after()` and push when it elapses.
 *
 * Only the newest schedule per user wins — the row's token is replaced by every
 * new call, and a sleeper whose token is gone exits quietly. That is what makes
 * "skip rest", "+30s" and "logged the next set early" cancel the pending push.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!pushEnabled()) return Response.json({ ok: false, reason: "push-not-configured" });

  let payload: { seconds?: number; nextExercise?: string; sessionId?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const seconds = clampRestSeconds(payload.seconds ?? 0);
  const token = crypto.randomUUID();
  const fireAt = new Date(Date.now() + seconds * 1000);
  const note = restNotification(payload.nextExercise ?? null, payload.sessionId ?? null);

  const db = await getDb();
  await db
    .insert(schema.restAlerts)
    .values({ userId, token, fireAt, sessionId: payload.sessionId ?? null, body: note.body })
    .onConflictDoUpdate({
      target: schema.restAlerts.userId,
      set: { token, fireAt, sessionId: payload.sessionId ?? null, body: note.body },
    });

  after(async () => {
    await sleep(seconds * 1000);
    const db2 = await getDb();
    const row = await db2.query.restAlerts.findFirst({
      where: eq(schema.restAlerts.userId, userId),
    });
    if (!row || row.token !== token) return; // superseded or cancelled
    await db2.delete(schema.restAlerts).where(eq(schema.restAlerts.token, token));
    await sendPushToUser(userId, note);
  });

  return Response.json({ ok: true, token, seconds });
}

/** Cancel the pending rest push (skip rest, next set logged, session finished). */
export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  await db.delete(schema.restAlerts).where(eq(schema.restAlerts.userId, userId));
  return Response.json({ ok: true });
}
