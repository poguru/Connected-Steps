import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { validateOfferInput, inWindow, type EarlyBirdOffer } from "@/lib/it-run-early-bird";

// Early bird offers (admin). Roles: event_admin (super_admin bypasses via requireRole).
//
// GET   /api/it-run/admin/early-bird              list offers with category, prices, quota, and overlap warnings
// POST  /api/it-run/admin/early-bird              create an offer
// PATCH /api/it-run/admin/early-bird              { id, ...fields } edit an offer; every change is audited
//
// Changing an offer never changes the amount already paid by a registration: each registration keeps the
// discount recorded when it was created.

type OfferRow = EarlyBirdOffer & { notes: string | null; created_by: string | null; updated_by: string | null; updated_at: string };

async function eventAndCategories(db: ReturnType<typeof getSupabaseServer>) {
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  if (!event) return null;
  const { data: cats } = await db
    .from("it_run_categories")
    .select("id, name, price_rupees, is_active")
    .eq("event_id", event.id)
    .returns<Array<{ id: string; name: string; price_rupees: number; is_active: boolean }>>();
  return { eventId: event.id, categories: cats ?? [] };
}

function overlaps(a: OfferRow, b: OfferRow): boolean {
  return a.id !== b.id && a.category_id === b.category_id &&
    Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}

export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const ctx = await eventAndCategories(db);
  if (!ctx) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_early_bird_offers")
    .select("*")
    .eq("event_id", ctx.eventId)
    .order("starts_at", { ascending: true })
    .returns<OfferRow[]>();
  if (error) return NextResponse.json({ error: "Could not load offers" }, { status: 500 });

  const now = Date.now();
  const rows = (data ?? []).map(o => {
    const cat = ctx.categories.find(c => c.id === o.category_id);
    const conflicts = (data ?? []).filter(other => overlaps(o, other)).map(other => other.id);
    return {
      ...o,
      category_name: cat?.name ?? "Unknown category",
      base_price_rupees: cat?.price_rupees ?? null,
      // Displayed state: a stored status plus the time window
      live_state: o.status !== "active" ? o.status
        : now < Date.parse(o.starts_at) ? "scheduled"
        : now >= Date.parse(o.ends_at) ? "expired"
        : o.redemption_limit !== null && o.redemptions_used >= o.redemption_limit ? "sold_out"
        : inWindow(o, now) ? "running" : "expired",
      quota_remaining: o.redemption_limit === null ? null : Math.max(0, o.redemption_limit - o.redemptions_used),
      overlaps_with: conflicts,
    };
  });

  return NextResponse.json({
    timezone: "Asia/Kolkata",
    quotaRule: "A redemption is one registration (booking), counted when the registration is created and released if it fails, expires, or is refunded.",
    categories: ctx.categories.map(c => ({ id: c.id, name: c.name, priceRupees: c.price_rupees, active: c.is_active })),
    offers: rows,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const db = getSupabaseServer();
  const ctx = await eventAndCategories(db);
  if (!ctx) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const categoryId = typeof body.category_id === "string" ? body.category_id : "";
  const cat = ctx.categories.find(c => c.id === categoryId);
  if (!cat) return NextResponse.json({ error: "Choose a category of this event." }, { status: 400 });

  const v = validateOfferInput(body, cat.price_rupees);
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 });

  const { data: created, error } = await db
    .from("it_run_early_bird_offers")
    .insert({ ...v.value, event_id: ctx.eventId, created_by: session.email, updated_by: session.email })
    .select("*")
    .maybeSingle<OfferRow>();
  if (error || !created) return NextResponse.json({ error: "Could not create the offer" }, { status: 500 });

  await db.from("it_run_audit_logs").insert({
    event_id: ctx.eventId, actor_email: session.email, actor_role: session.role,
    action: "early_bird_created", entity_type: "early_bird_offer", entity_id: created.id,
    ip: getClientIp(req), detail: { after: v.value },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, offer: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Offer id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const ctx = await eventAndCategories(db);
  if (!ctx) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: before } = await db
    .from("it_run_early_bird_offers")
    .select("*")
    .eq("id", id)
    .eq("event_id", ctx.eventId)
    .maybeSingle<OfferRow>();
  if (!before) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Merge the requested change onto the stored offer, then validate the whole result
  const merged = {
    name: body.name ?? before.name,
    category_id: body.category_id ?? before.category_id,
    discount_type: body.discount_type ?? before.discount_type,
    discount_value: body.discount_value ?? before.discount_value,
    starts_at: body.starts_at ?? before.starts_at,
    ends_at: body.ends_at ?? before.ends_at,
    redemption_limit: "redemption_limit" in body ? body.redemption_limit : before.redemption_limit,
    min_payable_rupees: body.min_payable_rupees ?? before.min_payable_rupees,
    status: body.status ?? before.status,
    notes: "notes" in body ? body.notes : before.notes,
  };
  const cat = ctx.categories.find(c => c.id === merged.category_id);
  if (!cat) return NextResponse.json({ error: "Choose a category of this event." }, { status: 400 });

  const v = validateOfferInput(merged, cat.price_rupees);
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 });

  // A limit cannot be set below the redemptions already made
  const newLimit = v.value.redemption_limit as number | null;
  if (newLimit !== null && newLimit < before.redemptions_used) {
    return NextResponse.json({ error: `The limit cannot be below the ${before.redemptions_used} redemptions already made.` }, { status: 400 });
  }

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(v.value)) {
    const from = (before as unknown as Record<string, unknown>)[k] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to ?? null)) changed[k] = { from, to };
  }
  if (Object.keys(changed).length === 0) return NextResponse.json({ ok: true, unchanged: true });

  const { data: updated, error } = await db
    .from("it_run_early_bird_offers")
    .update({ ...v.value, updated_by: session.email, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("updated_at", before.updated_at) // optimistic lock: someone else's edit is not overwritten
    .select("*")
    .maybeSingle<OfferRow>();
  if (error) return NextResponse.json({ error: "Could not save the offer" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "This offer was changed by someone else. Reload and try again." }, { status: 409 });

  const action = changed.status
    ? `early_bird_${String(changed.status.to)}`
    : "early_bird_updated";
  await db.from("it_run_audit_logs").insert({
    event_id: ctx.eventId, actor_email: session.email, actor_role: session.role,
    action, entity_type: "early_bird_offer", entity_id: id, ip: getClientIp(req),
    detail: { changed },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, offer: updated });
}
