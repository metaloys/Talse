import { supabaseAdmin } from "@/lib/supabase-server";
import { sendInAppNotifications, type InAppNotification } from "@/lib/pi-platform";

export type NotifyInput = InAppNotification & {
  /** Coarse category, used for the Inbox icon/label. Defaults to "general". */
  kind?: string;
  /** Optional related row id (hire_request_id / service_id) for deep-linking/debugging. */
  related_id?: string | null;
};

/**
 * Send an in-app notification to one or more Pioneers.
 *
 * Two independent best-effort steps, so a failure in either one never blocks
 * the other or the caller's primary action (a payment, a status change, a
 * message):
 *
 *   1. Persist to our own `notifications` table — this is what Talse's in-app
 *      Inbox reads, so the recipient always sees the notice inside the app.
 *   2. Push to Pi's Notification Center via the Platform API — this is what
 *      shows up in the Pi App; it is best-effort and requires the recipient to
 *      have granted the `in_app_notifications` scope.
 *
 * Never throws: callers treat notifications as fire-and-forget.
 */
export async function notifyUsers(notifications: NotifyInput[]): Promise<void> {
  if (!Array.isArray(notifications) || notifications.length === 0) return;

  // 1. Persist first, so the notice survives even if the Pi push fails.
  try {
    const rows = notifications.map((n) => ({
      user_uid: n.user_uid,
      title: n.title,
      body: n.body,
      subroute: n.subroute,
      kind: n.kind ?? "general",
      related_id: n.related_id ?? null,
    }));
    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) console.error("[notify] persist failed:", error.message);
  } catch (err) {
    console.error("[notify] persist threw:", err instanceof Error ? err.message : err);
  }

  // 2. Best-effort push to Pi's Notification Center.
  try {
    await sendInAppNotifications(
      notifications.map(({ title, body, user_uid, subroute }) => ({ title, body, user_uid, subroute }))
    );
  } catch (err) {
    console.error("[notify] Pi push failed:", err instanceof Error ? err.message : err);
  }
}
