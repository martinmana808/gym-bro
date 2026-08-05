// Server-side Web Push. iOS only delivers these to a PWA installed on the home
// screen, so the whole feature degrades to "nothing happens" everywhere else.
import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

let configured = false;
/** Returns false when the deployment has no VAPID keys (push simply off). */
function configure(): boolean {
  if (configured) return true;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:gym-bro@localhost",
    vapidPublicKey,
    priv,
  );
  configured = true;
  return true;
}

export const pushEnabled = () => configure();

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

/**
 * Send `payload` to every device the user has registered. Subscriptions the
 * push service reports as dead (404/410) are deleted — iOS expires them fairly
 * often, and a stale row would otherwise fail forever.
 * Returns how many devices actually received it.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const db = await getDb();
  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(schema.pushSubscriptions.userId, userId),
  });
  if (!subs.length) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 }, // a rest alert is worthless if it lands late
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db
            .delete(schema.pushSubscriptions)
            .where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error("push failed", status, (err as Error)?.message);
        }
      }
    }),
  );
  return delivered;
}
