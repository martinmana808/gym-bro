import { auth } from "@/auth";
import { pushEnabled, sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Fire a notification right now, so the user can confirm it actually lands. */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!pushEnabled()) return Response.json({ ok: false, delivered: 0, reason: "push-not-configured" });

  const delivered = await sendPushToUser(userId, {
    title: "Gym Bro",
    body: "Notifications are working. Now go lift something.",
    tag: "test",
    url: "/",
  });
  return Response.json({ ok: delivered > 0, delivered });
}
