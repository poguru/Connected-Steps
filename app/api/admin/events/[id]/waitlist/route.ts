import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

// GET — list waitlist for event
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_waitlist")
    .select("*")
    .eq("event_id", id)
    .order("position");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const waiting  = (data ?? []).filter(r => r.status === "waiting").length;
  const approved = (data ?? []).filter(r => r.status === "approved").length;
  return NextResponse.json({ waitlist: data ?? [], waiting, approved });
}

// PATCH — approve or reject a waitlist entry
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { waitlist_id, action } = await req.json() as { waitlist_id: string; action: "approve" | "reject" };
  if (!waitlist_id || !["approve","reject"].includes(action))
    return NextResponse.json({ error: "waitlist_id and action (approve|reject) required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data: entry } = await db
    .from("event_waitlist")
    .select("*, events(title, start_date, location, share_slug)")
    .eq("id", waitlist_id)
    .eq("event_id", id)
    .single();
  if (!entry) return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 });

  const newStatus = action === "approve" ? "approved" : "rejected";

  await db.from("event_waitlist").update({
    status:      newStatus,
    ...(action === "approve" ? { approved_at: new Date().toISOString(), notified_at: new Date().toISOString() } : {}),
  }).eq("id", waitlist_id);

  // Email notification
  if (action === "approve") {
    const ev = entry.events as { title: string; start_date: string; location: string; share_slug: string | null } | null;
    const registerUrl = ev?.share_slug
      ? `https://www.connectedsteps.in/events/${ev.share_slug}/register`
      : `https://www.connectedsteps.in/events`;
    after(async () => {
      await sendSingleEmail({
        to:      entry.user_email,
        subject: `You're in! A spot opened for ${ev?.title ?? "the event"}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
          <div style="margin-bottom:20px;">
            <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;"/>
            <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
          </div>
          <p style="color:#ccc;">Hi <strong style="color:#fff;">${entry.user_name}</strong>,</p>
          <p style="color:#ccc;">Great news! A spot has opened up for <strong style="color:#fff;">${ev?.title ?? "the event"}</strong> and you're next on the waitlist.</p>
          <p style="color:#ccc;">Please register now to secure your spot. Spots are limited and may fill quickly.</p>
          <div style="margin:24px 0;">
            <a href="${registerUrl}" style="padding:12px 24px;background:#e8620a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Register Now →</a>
          </div>
          <p style="color:#555;font-size:12px;">If you no longer wish to attend, you can ignore this email.</p>
          <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
            Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
          </div>
        </div>`,
      });
    });
  }

  return NextResponse.json({ success: true, status: newStatus });
}

// DELETE — remove entry from waitlist
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { waitlist_id } = await req.json() as { waitlist_id: string };
  const db = getSupabaseServer();
  await db.from("event_waitlist").delete().eq("id", waitlist_id).eq("event_id", id);
  return NextResponse.json({ success: true });
}
