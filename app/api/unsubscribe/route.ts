import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { recordConsent } from "@/lib/campaign-service";

import { APP_URL } from "@/lib/config";
// GET  /api/unsubscribe?token=X  — secure one-click from campaign emails (preferred)
// GET  /api/unsubscribe?email=X  — legacy email-based unsubscribe (kept for backward compat)
// POST /api/unsubscribe          — RFC 8058 List-Unsubscribe-Post (mail clients)
//
// All paths add the email to email_suppression so future non-transactional sends skip it.
// Transactional emails (OTP, registration confirmation, payment receipt) are NOT affected.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  // ── New: token-based unsubscribe ─────────────────────────────────────────
  if (token) {
    const db = getSupabaseServer();
    const { data } = await db.from("email_unsubscribe_tokens")
      .select("id, user_email, channel, used_at")
      .eq("token", token)
      .single();

    if (!data) {
      return NextResponse.redirect(new URL("/unsubscribe?error=invalid", req.url));
    }

    if (data.used_at) {
      return NextResponse.redirect(new URL(`/unsubscribe?already=1&email=${encodeURIComponent(data.user_email)}`, req.url));
    }

    const ip = req.headers.get("x-forwarded-for") ?? "";
    await processTokenUnsubscribe(db, data.id, data.user_email, data.channel, ip);
    return NextResponse.redirect(new URL(`/unsubscribe?success=1&email=${encodeURIComponent(data.user_email)}`, req.url));
  }

  // ── Legacy: email-based unsubscribe ──────────────────────────────────────
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      "<html><body style='font-family:sans-serif;text-align:center;padding:60px;'><h2>Invalid unsubscribe link</h2></body></html>",
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  await suppressEmail(email, "unsubscribe");

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Unsubscribed – Connected Steps</title></head>
<body style="margin:0;padding:60px 20px;font-family:'Helvetica Neue',sans-serif;background:#f4f4f5;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:48px 40px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="font-size:40px;margin-bottom:16px;">✅</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#0a0a0a;">You've been unsubscribed</h1>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">
      <strong>${email}</strong> has been removed from our mailing list.<br/>
      You will no longer receive non-essential emails from Connected Steps.
    </p>
    <p style="color:#888;font-size:13px;margin:0;">
      You will still receive important account emails such as OTP codes,
      registration confirmations, and payment receipts.
    </p>
    <div style="margin-top:32px;">
      <a href="${APP_URL}" style="color:#e8620a;font-size:14px;text-decoration:none;font-weight:600;">
        ← Return to Connected Steps
      </a>
    </div>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// RFC 8058 — email clients that support List-Unsubscribe-Post send a POST
// with body "List-Unsubscribe=One-Click". Also used by the /unsubscribe page.
export async function POST(req: NextRequest) {
  const body  = await req.json().catch(() => ({})) as Record<string, unknown>;
  const token = body.token as string | undefined;

  if (token) {
    const db = getSupabaseServer();
    const { data } = await db.from("email_unsubscribe_tokens")
      .select("id, user_email, channel, used_at").eq("token", token).single();
    if (!data) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (data.used_at) return NextResponse.json({ already: true, email: data.user_email });
    const ip = req.headers.get("x-forwarded-for") ?? "";
    await processTokenUnsubscribe(db, data.id, data.user_email, data.channel, ip);
    return NextResponse.json({ ok: true, email: data.user_email });
  }

  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await suppressEmail(email, "unsubscribe");
  }
  return NextResponse.json({ unsubscribed: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function processTokenUnsubscribe(
  db:        ReturnType<typeof getSupabaseServer>,
  tokenId:   string,
  userEmail: string,
  channel:   string,
  ip:        string,
) {
  await db.from("email_unsubscribe_tokens")
    .update({ used_at: new Date().toISOString() }).eq("id", tokenId);

  await db.from("users").update({
    marketing_consent:        false,
    marketing_consent_at:     new Date().toISOString(),
    marketing_consent_source: "unsubscribe_link",
  }).eq("email", userEmail);

  const prefUpdates: Record<string, boolean> = {};
  if (channel === "email" || channel === "all") {
    prefUpdates.email_marketing = false;
    prefUpdates.email_partners  = false;
  }
  if (channel === "whatsapp" || channel === "all") {
    prefUpdates.wa_marketing = false;
    prefUpdates.wa_partners  = false;
  }

  await db.from("user_notification_preferences").upsert(
    { user_email: userEmail, ...prefUpdates, updated_at: new Date().toISOString() },
    { onConflict: "user_email" },
  );

  try {
    await recordConsent({
      userEmail,
      action: "opt_out",
      preferencesSnapshot: prefUpdates,
      source: "unsubscribe_link",
      ipAddress: ip,
    });
  } catch { /* non-critical */ }

  await suppressEmail(userEmail, "unsubscribe");
}

async function suppressEmail(email: string, reason: string) {
  const db = getSupabaseServer();
  try {
    await db.from("email_suppression").upsert({
      email,
      reason,
      suppressed_at: new Date().toISOString(),
    }, { onConflict: "email" });
  } catch (e) {
    console.error("[unsubscribe] Failed to record suppression:", e);
  }
  console.log(`[unsubscribe] Suppressed email=${email} reason=${reason}`);
}
