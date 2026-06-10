/**
 * In-app notification helper.
 *
 * Every call:
 *   1. Writes a row to the `notifications` table (persistent in-app record)
 *   2. Optionally fires a push notification to all registered devices
 *
 * Call this from API routes and cron jobs whenever something noteworthy happens.
 * WhatsApp / email are separate channels — call them independently.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import webpush from "web-push";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "session_reminder"
  | "coach_message"
  | "achievement"
  | "membership_expiry"
  | "new_session";

export interface InAppNotification {
  user_email: string;
  type:       NotificationType;
  title:      string;
  body:       string;
  action_url?: string;
}

// ── VAPID init (lazy, safe at build time) ─────────────────────────────────────

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:connected.steps2106@gmail.com", pub, priv);
  vapidReady = true;
  return true;
}

// ── Core: create one notification ─────────────────────────────────────────────

export async function createNotification(n: InAppNotification): Promise<string | null> {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("notifications")
    .insert({
      user_email: n.user_email.toLowerCase(),
      type:       n.type,
      title:      n.title,
      body:       n.body,
      action_url: n.action_url ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[notify-inapp] insert error:", error.message);
    return null;
  }

  // Fire push in background — don't block the caller
  sendPush(n).catch(() => {});

  return data.id as string;
}

// ── Bulk: create the same notification for multiple users ─────────────────────

export async function createNotifications(
  users:     { email: string }[],
  type:      NotificationType,
  title:     string,
  body:      string,
  actionUrl?: string,
): Promise<void> {
  if (users.length === 0) return;
  const db = getSupabaseServer();

  const rows = users.map(u => ({
    user_email: u.email.toLowerCase(),
    type,
    title,
    body,
    action_url: actionUrl ?? null,
  }));

  const { error } = await db.from("notifications").insert(rows);
  if (error) console.error("[notify-inapp] bulk insert error:", error.message);

  // Push each user in background
  for (const u of users) {
    sendPush({ user_email: u.email, type, title, body, action_url: actionUrl }).catch(() => {});
  }
}

// ── Push delivery (web VAPID + Expo mobile) ───────────────────────────────────

async function sendPush(n: InAppNotification): Promise<void> {
  const db    = getSupabaseServer();
  const email = n.user_email.toLowerCase();

  const payload = JSON.stringify({
    title: n.title,
    body:  n.body,
    icon:  "/logo.png",
    url:   n.action_url ?? "/notifications",
  });

  // ── Web Push (VAPID) ──────────────────────────────────────────────────────

  if (ensureVapid()) {
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_email", email);

    await Promise.allSettled(
      (subs ?? []).map(s => webpush.sendNotification(s.subscription, payload))
    );
  }

  // ── Expo Push (mobile) ────────────────────────────────────────────────────

  const { data: tokens } = await db
    .from("push_tokens")
    .select("token")
    .eq("user_email", email);

  if (tokens && tokens.length > 0) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map(t => ({
          to:    t.token,
          title: n.title,
          body:  n.body,
          sound: "default",
          data:  { url: n.action_url ?? "/notifications" },
        }))
      ),
    }).catch(() => {});
  }
}
