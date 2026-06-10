// Required Supabase table (run once in SQL editor):
//
// create table plan_templates (
//   id          uuid primary key default gen_random_uuid(),
//   name        text not null,
//   description text not null default '',
//   days        jsonb not null,
//   created_at  timestamptz not null default now(),
//   updated_at  timestamptz not null default now()
// );

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db.from("plan_templates").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ templates: [] });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, days } = await req.json().catch(() => ({}));
  if (!name?.trim() || !Array.isArray(days) || days.length !== 7)
    return NextResponse.json({ error: "name and 7 days required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db.from("plan_templates").insert({
    name:        name.trim(),
    description: description?.trim() ?? "",
    days,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();
  await db.from("plan_templates").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
