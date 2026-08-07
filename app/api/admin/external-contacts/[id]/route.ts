import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/external-contacts/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: contact, error } = await db.from("external_contacts").select("*").eq("id", id).single();
  if (error || !contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: activity }, { data: lists }] = await Promise.all([
    db.from("external_contact_activity").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("contact_list_members")
      .select("list_id, contact_lists(id, name, color, category)")
      .eq("contact_id", id),
  ]);

  return NextResponse.json({
    contact,
    activity: activity ?? [],
    lists:    (lists ?? []).map(m => m.contact_lists).filter(Boolean),
  });
}

// PUT /api/admin/external-contacts/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  const { data: existing } = await db.from("external_contacts").select("id, email_consent, whatsapp_consent").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newEmailConsent    = body.email_consent    === true;
  const newWhatsappConsent = body.whatsapp_consent === true;

  const patch: Record<string, unknown> = {
    full_name:        body.full_name        ?? undefined,
    company_name:     body.company_name     ?? null,
    designation:      body.designation      ?? null,
    email:            body.email            ?? null,
    mobile:           body.mobile           ?? null,
    whatsapp_number:  body.whatsapp_number  ?? null,
    city:             body.city             ?? null,
    state:            body.state            ?? null,
    country:          body.country          ?? "India",
    tags:             body.tags             ?? [],
    notes:            body.notes            ?? null,
    source:           body.source           ?? null,
    email_consent:    newEmailConsent,
    whatsapp_consent: newWhatsappConsent,
    sms_consent:      body.sms_consent      === true,
    is_active:        body.is_active        !== false,
    do_not_contact:   body.do_not_contact   === true,
    updated_at:       new Date().toISOString(),
  };

  // Log consent changes
  const consentChanges: Array<{ channel: string; action: string }> = [];
  if (newEmailConsent !== existing.email_consent) {
    consentChanges.push({ channel: "email", action: newEmailConsent ? "opt_in" : "opt_out" });
  }
  if (newWhatsappConsent !== existing.whatsapp_consent) {
    consentChanges.push({ channel: "whatsapp", action: newWhatsappConsent ? "opt_in" : "opt_out" });
  }

  const { data: updated, error } = await db.from("external_contacts").update(patch).eq("id", id).select().single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A contact with this email/mobile already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (consentChanges.length) {
    await db.from("external_contact_consent").insert(
      consentChanges.map(c => ({ contact_id: id, channel: c.channel, action: c.action, source: "admin", changed_by: "admin" }))
    );
  }

  await db.from("external_contact_activity").insert({
    contact_id: id, activity_type: "updated", details: { changed_by: "admin" },
  });

  return NextResponse.json({ contact: updated });
}

// DELETE /api/admin/external-contacts/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { error } = await db.from("external_contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
