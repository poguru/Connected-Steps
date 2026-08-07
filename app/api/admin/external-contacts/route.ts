import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/external-contacts
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q        = searchParams.get("q")        ?? "";
  const status   = searchParams.get("status")   ?? "";  // active | inactive
  const consent  = searchParams.get("consent")  ?? "";  // email | whatsapp
  const city     = searchParams.get("city")     ?? "";
  const state    = searchParams.get("state")    ?? "";
  const tag      = searchParams.get("tag")      ?? "";
  const list_id  = searchParams.get("list_id")  ?? "";
  const limit    = Math.min(Number(searchParams.get("limit")  ?? 50), 500);
  const offset   = Number(searchParams.get("offset") ?? 0);

  const db = getSupabaseServer();

  // If filtering by list, get IDs in that list first
  let listContactIds: string[] | null = null;
  if (list_id) {
    const { data: members } = await db.from("contact_list_members")
      .select("contact_id").eq("list_id", list_id);
    listContactIds = (members ?? []).map(m => m.contact_id);
    if (listContactIds.length === 0) {
      return NextResponse.json({ contacts: [], total: 0, stats: await getStats(db) });
    }
  }

  let query = db.from("external_contacts")
    .select("id, full_name, company_name, designation, email, mobile, whatsapp_number, city, state, country, tags, email_consent, whatsapp_consent, is_active, do_not_contact, last_contacted, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%,whatsapp_number.ilike.%${q}%`);
  }
  if (status === "active")   query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);
  if (consent === "email")   query = query.eq("email_consent", true);
  if (consent === "whatsapp")query = query.eq("whatsapp_consent", true);
  if (city)                  query = query.ilike("city", `%${city}%`);
  if (state)                 query = query.ilike("state", `%${state}%`);
  if (tag)                   query = query.contains("tags", [tag]);
  if (listContactIds)        query = query.in("id", listContactIds);

  const { data: contacts, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stats = await getStats(db);
  return NextResponse.json({ contacts: contacts ?? [], total: count ?? 0, stats });
}

async function getStats(db: ReturnType<typeof getSupabaseServer>) {
  const { data } = await db.from("external_contacts").select("is_active, do_not_contact, email_consent, whatsapp_consent, email");
  const all = data ?? [];
  return {
    total:            all.length,
    active:           all.filter(r => r.is_active && !r.do_not_contact).length,
    inactive:         all.filter(r => !r.is_active).length,
    do_not_contact:   all.filter(r => r.do_not_contact).length,
    email_consent:    all.filter(r => r.email_consent).length,
    whatsapp_consent: all.filter(r => r.whatsapp_consent).length,
    with_email:       all.filter(r => r.email).length,
  };
}

// POST /api/admin/external-contacts
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  if (!body.full_name) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (!body.email && !body.mobile && !body.whatsapp_number) {
    return NextResponse.json({ error: "At least one contact method required (email, mobile, or whatsapp_number)" }, { status: 400 });
  }

  const { data, error } = await db.from("external_contacts").insert({
    full_name:        String(body.full_name).trim(),
    company_name:     body.company_name      ?? null,
    designation:      body.designation       ?? null,
    email:            body.email             ?? null,
    mobile:           body.mobile            ?? null,
    whatsapp_number:  body.whatsapp_number   ?? null,
    city:             body.city              ?? null,
    state:            body.state             ?? null,
    country:          body.country           ?? "India",
    tags:             body.tags              ?? [],
    notes:            body.notes             ?? null,
    source:           body.source            ?? "manual",
    email_consent:    body.email_consent     === true,
    whatsapp_consent: body.whatsapp_consent  === true,
    sms_consent:      body.sms_consent       === true,
    consent_date:     body.email_consent || body.whatsapp_consent ? new Date().toISOString() : null,
    consent_source:   body.consent_source    ?? null,
    is_active:        true,
    do_not_contact:   false,
    created_by:       "admin",
  }).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A contact with this email, mobile, or WhatsApp number already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await db.from("external_contact_activity").insert({
    contact_id:    data.id,
    activity_type: "imported",
    details:       { source: "manual", created_by: "admin" },
  });

  return NextResponse.json({ contact: data }, { status: 201 });
}
