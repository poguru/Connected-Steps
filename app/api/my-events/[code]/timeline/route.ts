import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

type Params = { params: Promise<{ code: string }> };

interface TimelineItem {
  id:       string;
  label:    string;
  detail:   string | null;
  ts:       string | null;
  done:     boolean;
  icon:     string;
  category: "registration" | "payment" | "communication" | "event_day" | "post_event";
}

// GET /api/my-events/[code]/timeline
// Returns the participant journey timeline for a registration.
export async function GET(req: NextRequest, { params }: Params) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const db = getSupabaseServer();

  // Fetch registration (ownership check built in)
  const { data: reg } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, event_id, user_email, user_name,
      payment_status, status, final_price, qr_token, created_at,
      checked_in_at, bib_collected_at, certificate_url, certificate_generated_at,
      tshirt_issued: event_participants!inner(tshirt_issued)
    `)
    .eq("registration_code", code.toUpperCase())
    .eq("user_email", userEmail.toLowerCase())
    .single();

  if (!reg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch participants + emails + service logs in parallel
  const [participantsRes, emailsRes, serviceLogsRes, resultRes] = await Promise.all([
    db.from("event_participants")
      .select("first_name, last_name, checked_in_at, bib_collected_at, tshirt_issued, breakfast_availed, medal_issued, certificate_generated_at, certificate_url, status")
      .eq("registration_id", reg.id)
      .order("created_at", { ascending: true }),

    db.from("email_queue")
      .select("subject, status, sent_at, delivered_at, opened_at, created_at")
      .eq("event_id", reg.event_id)
      .eq("recipient_email", userEmail.toLowerCase())
      .order("created_at", { ascending: true })
      .limit(20),

    db.from("event_service_logs")
      .select("service_name, action, created_at, notes")
      .eq("registration_id", reg.id)
      .order("created_at", { ascending: true })
      .limit(50),

    db.from("event_results")
      .select("finish_time, overall_position, category_position, status, chip_time_secs, created_at")
      .eq("registration_id", reg.id)
      .maybeSingle(),
  ]);

  const participants = participantsRes.data ?? [];
  const emails       = emailsRes.data ?? [];
  const serviceLogs  = serviceLogsRes.data ?? [];

  const items: TimelineItem[] = [];
  let seq = 0;

  // ── 1. Registration Submitted ────────────────────────────────────────────────
  items.push({
    id: `t${seq++}`, label: "Registration Submitted", detail: `Code: ${reg.registration_code}`,
    ts: reg.created_at, done: true, icon: "📋", category: "registration",
  });

  // ── 2. Payment ───────────────────────────────────────────────────────────────
  if (reg.payment_status === "free") {
    items.push({
      id: `t${seq++}`, label: "Free Registration Confirmed", detail: "No payment required",
      ts: reg.created_at, done: true, icon: "✅", category: "payment",
    });
  } else if (reg.payment_status === "paid") {
    items.push({
      id: `t${seq++}`, label: "Payment Confirmed", detail: `₹${reg.final_price} received`,
      ts: null, done: true, icon: "💳", category: "payment",
    });
  } else if (reg.payment_status === "pending") {
    items.push({
      id: `t${seq++}`, label: "Payment Pending", detail: "Complete payment to confirm your spot",
      ts: null, done: false, icon: "⏳", category: "payment",
    });
  }

  // ── 3. QR Generated ──────────────────────────────────────────────────────────
  if (reg.qr_token) {
    items.push({
      id: `t${seq++}`, label: "QR Code Ready", detail: "Your event pass is ready",
      ts: null, done: true, icon: "🎫", category: "registration",
    });
  }

  // ── 4. Email communications ───────────────────────────────────────────────────
  const emailLabels: Record<string, string> = {
    "confirmation": "Confirmation Email Sent",
    "qr":           "QR Code Email Sent",
    "reminder":     "Reminder Sent",
    "update":       "Event Update Sent",
    "certificate":  "Certificate Email Sent",
    "bib":          "BIB Collection Reminder Sent",
  };

  for (const email of emails) {
    if (!email.sent_at) continue;
    const subjectLower = (email.subject ?? "").toLowerCase();
    let label = "Email Sent";
    for (const [kw, lbl] of Object.entries(emailLabels)) {
      if (subjectLower.includes(kw)) { label = lbl; break; }
    }
    items.push({
      id: `t${seq++}`, label,
      detail: email.status === "delivered"
        ? (email.opened_at ? "Delivered & opened" : "Delivered")
        : email.status === "failed" ? "Delivery failed" : email.status,
      ts: email.sent_at, done: true, icon: "📧", category: "communication",
    });
  }

  // ── 5. Service log events ────────────────────────────────────────────────────
  const serviceLabels: Record<string, { label: string; icon: string }> = {
    "checkin":    { label: "Checked In", icon: "✅" },
    "check_in":   { label: "Checked In", icon: "✅" },
    "tshirt":     { label: "T-Shirt Collected", icon: "👕" },
    "t_shirt":    { label: "T-Shirt Collected", icon: "👕" },
    "bib":        { label: "BIB Collected", icon: "🎽" },
    "breakfast":  { label: "Breakfast Collected", icon: "🍽" },
    "meal":       { label: "Meal Collected", icon: "🍽" },
    "medal":      { label: "Medal Received", icon: "🏅" },
    "finisher":   { label: "Finisher Kit Collected", icon: "🏅" },
  };

  for (const log of serviceLogs) {
    const key = log.service_name?.toLowerCase().replace(/[-\s]/g, "_") ?? "";
    const found = serviceLabels[key];
    if (found) {
      items.push({
        id: `t${seq++}`, label: found.label,
        detail: log.notes ?? null,
        ts: log.created_at, done: true, icon: found.icon, category: "event_day",
      });
    }
  }

  // ── 6. Participant-level milestones (fallback if service logs missing) ───────
  const firstP = participants[0];
  if (firstP) {
    const addedMilestones = new Set(
      items.filter(i => i.category === "event_day").map(i => i.label)
    );
    if (firstP.checked_in_at && !addedMilestones.has("Checked In")) {
      items.push({
        id: `t${seq++}`, label: "Checked In", detail: null,
        ts: firstP.checked_in_at, done: true, icon: "✅", category: "event_day",
      });
    }
    if (firstP.bib_collected_at && !addedMilestones.has("BIB Collected")) {
      items.push({
        id: `t${seq++}`, label: "BIB Collected", detail: null,
        ts: firstP.bib_collected_at, done: true, icon: "🎽", category: "event_day",
      });
    }
  }

  // ── 7. Result ────────────────────────────────────────────────────────────────
  if (resultRes.data) {
    const r = resultRes.data;
    const mins = r.chip_time_secs ? Math.floor(r.chip_time_secs / 60) : null;
    const secs = r.chip_time_secs ? r.chip_time_secs % 60 : null;
    const timeStr = mins != null && secs != null ? `${mins}:${String(secs).padStart(2, "0")}` : r.finish_time ?? null;
    items.push({
      id: `t${seq++}`, label: "Race Completed",
      detail: [timeStr && `Time: ${timeStr}`, r.overall_position && `Rank #${r.overall_position}`].filter(Boolean).join(" · ") || null,
      ts: null, done: true, icon: "🏁", category: "post_event",
    });
  }

  // ── 8. Certificate ───────────────────────────────────────────────────────────
  const certUrl = reg.certificate_url ?? firstP?.certificate_url;
  const certTs  = reg.certificate_generated_at ?? firstP?.certificate_generated_at ?? null;
  if (certUrl || certTs) {
    items.push({
      id: `t${seq++}`, label: "Certificate Available",
      detail: "Download your finisher certificate",
      ts: certTs, done: true, icon: "🏆", category: "post_event",
    });
  }

  // ── Sort by timestamp (nulls last) ──────────────────────────────────────────
  items.sort((a, b) => {
    if (!a.ts && !b.ts) return 0;
    if (!a.ts) return 1;
    if (!b.ts) return -1;
    return a.ts.localeCompare(b.ts);
  });

  return NextResponse.json({ timeline: items, total: items.length });
}
