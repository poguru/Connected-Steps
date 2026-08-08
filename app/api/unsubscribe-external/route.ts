import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/unsubscribe-external?token=xxx — confirm the token is valid (used by the page)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = getSupabaseServer();
  const { data } = await db.from("ext_unsubscribe_tokens")
    .select("id, email, used_at").eq("token", token).maybeSingle();

  if (!data)      return NextResponse.json({ error: "Invalid or expired unsubscribe link" }, { status: 404 });
  if (data.used_at) return NextResponse.json({ alreadyUnsubscribed: true, email: data.email });

  return NextResponse.json({ valid: true, email: data.email });
}

// POST /api/unsubscribe-external — process the unsubscribe
// Body: { token: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { token?: string };
  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = getSupabaseServer();

  // Look up the token
  const { data: tokenRow } = await db.from("ext_unsubscribe_tokens")
    .select("id, email, used_at").eq("token", token).maybeSingle();

  if (!tokenRow) return NextResponse.json({ error: "Invalid or expired unsubscribe link" }, { status: 404 });
  if (tokenRow.used_at) return NextResponse.json({ alreadyUnsubscribed: true, email: tokenRow.email });

  const email = tokenRow.email.toLowerCase();
  const now   = new Date().toISOString();

  // Mark token as used
  await db.from("ext_unsubscribe_tokens")
    .update({ used_at: now }).eq("id", tokenRow.id);

  // Add to global suppression list (idempotent — upsert)
  await db.from("email_suppression").upsert(
    { email, reason: "unsubscribe", suppressed_at: now },
    { onConflict: "email", ignoreDuplicates: false },
  );

  // Set do_not_contact on the external contact record
  const { data: contact } = await db.from("external_contacts")
    .select("id").ilike("email", email).maybeSingle();

  if (contact) {
    await db.from("external_contacts").update({
      do_not_contact:       true,
      unsubscribed_at:      now,
      unsubscribe_channel:  "email",
      updated_at:           now,
    }).eq("id", contact.id);

    // Log consent change
    await db.from("external_contact_consent").insert({
      contact_id: contact.id,
      channel:    "email",
      action:     "opt_out",
      source:     "unsubscribe_link",
    });

    // Log activity
    await db.from("external_contact_activity").insert({
      contact_id:    contact.id,
      activity_type: "unsubscribed",
      details:       { channel: "email", source: "unsubscribe_link" },
    });
  }

  return NextResponse.json({ unsubscribed: true, email });
}
