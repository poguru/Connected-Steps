import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/registrations
// Query params:
//   event_id        uuid   filter to one event (required for per-event view)
//   page            int    0-based (default 0)
//   limit           int    rows per page, max 200 (default 50)
//   q               str    ilike search on name, email, registration_code
//   status          str    confirmed | cancelled | pending_payment
//   payment_status  str    paid | free | pending | expired
//   sort            str    column (default "created_at")
//   order           str    asc | desc (default "desc")
//
// Response: { registrations[], summary{}, total, page, limit, has_more }
// Summary uses registration_summary() RPC — one SQL pass, not N+1 counts.

const VALID_SORT = new Set(["created_at", "final_price", "payment_status", "status", "user_name", "user_email"]);
const PAGE_LIMIT  = 50;
const MAX_LIMIT   = 200;

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp             = req.nextUrl.searchParams;
  const eventId        = sp.get("event_id") ?? null;
  const page           = Math.max(0, parseInt(sp.get("page")  ?? "0",  10));
  const limit          = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get("limit") ?? String(PAGE_LIMIT), 10)));
  const q              = sp.get("q")?.trim()              ?? "";
  const statusFilter   = sp.get("status")?.trim()         ?? "";
  const paymentFilter  = sp.get("payment_status")?.trim() ?? "";
  const sort           = VALID_SORT.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "created_at";
  const asc            = sp.get("order") === "asc";

  const db = getSupabaseServer();

  // ── Paginated data query ──────────────────────────────────────────────────
  let query = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name, phone, blood_group,
      emergency_contact, coupon_code, coupon_discount, original_price, final_price,
      payment_status, razorpay_payment_id, status, created_at,
      distance_category, qr_token, checked_in_at,
      events ( id, title, start_date, location )
    `, { count: "exact" })
    .order(sort, { ascending: asc });

  if (eventId) query = query.eq("event_id", eventId) as typeof query;
  if (statusFilter)  query = query.eq("status",         statusFilter)  as typeof query;
  if (paymentFilter) query = query.eq("payment_status", paymentFilter) as typeof query;

  if (q) {
    query = query.or(
      `user_name.ilike.%${q}%,user_email.ilike.%${q}%,registration_code.ilike.%${q}%,phone.ilike.%${q}%`,
    ) as typeof query;
  }

  query = query.range(page * limit, page * limit + limit - 1) as typeof query;

  // ── Summary RPC (single SQL pass, not N+1 counts) ─────────────────────────
  const [{ data, count, error }, { data: summaryRaw }] = await Promise.all([
    query,
    db.rpc("registration_summary", { p_event_id: eventId ?? null }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = (summaryRaw as Record<string, number>) ?? {
    total: count ?? 0, paid: 0, free: 0, pending: 0, revenue: 0,
  };

  return NextResponse.json({
    registrations: data ?? [],
    summary,
    total:    count ?? 0,
    page,
    limit,
    has_more: (page * limit + limit) < (count ?? 0),
  });
}

// PATCH /api/admin/events/registrations — cancel or update status
// Idempotency: if status already matches the requested value, return the current
// row without touching the DB. Prevents double-submit from network retries.
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  const VALID_STATUSES = ["confirmed", "cancelled", "pending_payment"];
  if (!VALID_STATUSES.includes(status))
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });

  const db = getSupabaseServer();

  // Read current state first — idempotency guard
  const { data: current } = await db
    .from("event_registrations")
    .select("id, status, event_id, user_email, user_name")
    .eq("id", id)
    .single();

  if (!current) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  // Idempotent: already in the requested state — return without writing
  if (current.status === status) {
    return NextResponse.json({ data: current, idempotent: true });
  }

  const { data, error } = await db
    .from("event_registrations")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — write fire-and-forget so it never blocks the response
  // Audit log — fire-and-forget; failure must never break the main operation
  // Audit log — fire-and-forget; failure must never break the main operation
  void (async () => {
    try {
      await db.from("audit_logs").insert({
        action:     `registration_${status}`,
        table_name: "event_registrations",
        record_id:  id,
        event_id:   current.event_id,
        metadata: {
          previous_status: current.status,
          new_status:      status,
          user_email:      current.user_email,
          user_name:       current.user_name,
        },
      });
    } catch { /* never block the response */ }
  })();

  return NextResponse.json({ data });
}
