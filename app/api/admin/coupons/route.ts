import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

function randomCode(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix ? prefix.toUpperCase() + "-" : "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("coupons")
    .select("*, coupon_uses(count)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const {
    type,           // "shared" | "unique"
    code,           // manual code (shared only)
    prefix,         // prefix for auto-generated unique codes
    emails,         // string[] — one code per member (unique)
    description,
    discount_type,  // "percentage" | "fixed"
    discount_value,
    max_uses,
    event_id,
    expires_at,
  } = body;

  const db = getSupabaseServer();

  if (type === "shared") {
    if (!code) return NextResponse.json({ error: "Code is required for shared coupons." }, { status: 400 });
    const { data, error } = await db.from("coupons").insert({
      code: code.toUpperCase().trim(),
      description: description || "",
      discount_type,
      discount_value: Number(discount_value),
      assigned_to_email: null,
      event_id: event_id || null,
      max_uses: Number(max_uses) || 999,
      expires_at: expires_at || null,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (type === "unique") {
    // Generate one unique code per email
    const emailList: string[] = Array.isArray(emails) ? emails.filter(Boolean) : [];
    if (emailList.length === 0) return NextResponse.json({ error: "Provide at least one member email." }, { status: 400 });

    const rows = emailList.map((email) => ({
      code: randomCode(prefix || "CS"),
      description: description || "",
      discount_type,
      discount_value: Number(discount_value),
      assigned_to_email: email.toLowerCase().trim(),
      event_id: event_id || null,
      max_uses: 1,
      expires_at: expires_at || null,
    }));

    const { data, error } = await db.from("coupons").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Invalid coupon type." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getSupabaseServer();
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
