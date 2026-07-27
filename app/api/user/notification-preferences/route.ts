import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

const ALLOWED_KEYS = new Set([
  "email_events", "email_training", "email_reminders", "email_marketing",
  "wa_events",    "wa_training",    "wa_reminders",    "wa_marketing",
  "push_events",  "push_training",  "push_reminders",
]);

// GET /api/user/notification-preferences
// Returns the authenticated user's notification preferences.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const { data } = await db
    .from("user_notification_preferences")
    .select("*")
    .eq("user_email", userEmail.toLowerCase())
    .maybeSingle();

  if (!data) {
    // Return defaults — row is created on first PATCH
    return NextResponse.json({
      preferences: {
        email_events: true, email_training: true, email_reminders: true, email_marketing: false,
        wa_events:    true, wa_training:    true, wa_reminders:    true, wa_marketing:    false,
        push_events:  true, push_training:  true, push_reminders:  true,
      },
    });
  }

  return NextResponse.json({ preferences: data });
}

// PATCH /api/user/notification-preferences
// Body: partial object with boolean values for any of the allowed keys.
export async function PATCH(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Only allow boolean values for whitelisted keys
  const updates: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(body)) {
    if (ALLOWED_KEYS.has(key) && typeof val === "boolean") {
      updates[key] = val;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("user_notification_preferences")
    .upsert(
      { user_email: userEmail.toLowerCase(), ...updates, updated_at: new Date().toISOString() },
      { onConflict: "user_email" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[notification-preferences] upsert error:", error.message);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
}
