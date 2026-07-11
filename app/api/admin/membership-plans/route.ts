import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// â”€â”€ GET â€” list all plans (admin sees inactive ones too) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("membership_plans")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

// â”€â”€ POST â€” create a new plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("membership_plans")
    .insert({
      name:            body.name,
      slug:            body.slug,
      tagline:         body.tagline        ?? null,
      description:     body.description    ?? null,
      price:           body.price          ?? null,
      billing_label:   body.billing_label  ?? null,
      razorpay_plan:   body.razorpay_plan  ?? null,
      features:        body.features       ?? [],
      cta_label:       body.cta_label      ?? "Get Started",
      cta_href:        body.cta_href       ?? null,
      is_active:       body.is_active      ?? true,
      is_featured:     body.is_featured    ?? false,
      is_contact_only: body.is_contact_only ?? false,
      display_order:   body.display_order  ?? 99,
      badge_label:     body.badge_label    ?? null,
      color_accent:    body.color_accent   ?? "orange",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ plan: data }, { status: 201 });
}

// â”€â”€ PATCH â€” update a plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("membership_plans")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ plan: data });
}

// â”€â”€ DELETE â€” delete a plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("membership_plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
