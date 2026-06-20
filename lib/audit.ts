import { getSupabaseServer } from "@/lib/supabase-server";

type AuditAction =
  | "admin_login"
  | "coach_login"
  | "user_edit"
  | "membership_change"
  | "coach_assignment"
  | "event_create"
  | "event_edit"
  | "event_delete"
  | "session_create"
  | "session_edit"
  | "notification_broadcast"
  | "leaderboard_recalculate";

interface AuditEntry {
  action:      AuditAction;
  actor_email: string;
  target?:     string;
  detail?:     Record<string, unknown>;
  ip?:         string;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const db = getSupabaseServer();
    await db.from("audit_logs").insert({
      action:      entry.action,
      actor_email: entry.actor_email,
      target:      entry.target ?? null,
      detail:      entry.detail ?? null,
      ip:          entry.ip    ?? null,
    });
  } catch {
    // Never throw — audit failure must not break the primary operation
    console.error("[audit] failed to write audit log:", entry.action, entry.actor_email);
  }
}
