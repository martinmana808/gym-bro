import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

type Body = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

/** Store (or refresh) this device's push subscription. */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth_ = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth_) return new Response("Bad request", { status: 400 });

  const db = await getDb();
  // The endpoint is unique across users: if a device changes account, move it.
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth: auth_ })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, p256dh, auth: auth_ },
    });
  return Response.json({ ok: true });
}

/** Forget this device (called when the user turns notifications off). */
export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let endpoint = "";
  try {
    endpoint = String(((await request.json()) as Body).endpoint ?? "");
  } catch {
    // no body — fall through and delete every device for this user
  }
  const db = await getDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(
      endpoint
        ? and(
            eq(schema.pushSubscriptions.userId, userId),
            eq(schema.pushSubscriptions.endpoint, endpoint),
          )
        : eq(schema.pushSubscriptions.userId, userId),
    );
  return Response.json({ ok: true });
}
