import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/external-contacts/export?format=csv&list_id=&status=&tag=
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const listId = searchParams.get("list_id") ?? "";
  const status = searchParams.get("status")  ?? "";
  const tag    = searchParams.get("tag")     ?? "";

  const db = getSupabaseServer();

  let listContactIds: string[] | null = null;
  if (listId) {
    const { data: members } = await db.from("contact_list_members")
      .select("contact_id").eq("list_id", listId);
    listContactIds = (members ?? []).map(m => m.contact_id);
    if (!listContactIds.length) listContactIds = ["00000000-0000-0000-0000-000000000000"]; // empty
  }

  let query = db.from("external_contacts")
    .select("full_name, company_name, designation, email, mobile, whatsapp_number, city, state, country, tags, email_consent, whatsapp_consent, sms_consent, source, notes, is_active, do_not_contact, created_at")
    .order("full_name");

  if (status === "active")    query = query.eq("is_active", true).eq("do_not_contact", false);
  if (status === "inactive")  query = query.eq("is_active", false);
  if (tag)                    query = query.contains("tags", [tag]);
  if (listContactIds)         query = query.in("id", listContactIds);

  const { data, error } = await query.limit(100_000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  const HEADERS = ["Name","Company","Designation","Email","Mobile","WhatsApp","City","State","Country","Tags","Email Consent","WA Consent","SMS Consent","Source","Notes","Active","Do Not Contact","Created"];
  const csvRows = [
    HEADERS,
    ...rows.map(r => [
      r.full_name, r.company_name ?? "", r.designation ?? "",
      r.email ?? "", r.mobile ?? "", r.whatsapp_number ?? "",
      r.city ?? "", r.state ?? "", r.country ?? "",
      (r.tags ?? []).join(";"),
      r.email_consent ? "Yes" : "No",
      r.whatsapp_consent ? "Yes" : "No",
      r.sms_consent ? "Yes" : "No",
      r.source ?? "", r.notes ?? "",
      r.is_active ? "Yes" : "No",
      r.do_not_contact ? "Yes" : "No",
      r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
    ]),
  ];

  const csv = csvRows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const filename = `contacts-${new Date().toISOString().slice(0,10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
