// Required Supabase tables (run once in SQL editor):
//
// create table cohorts (
//   id          uuid primary key default gen_random_uuid(),
//   name        text not null,
//   description text not null default '',
//   color       text not null default '#e8620a',
//   created_at  timestamptz not null default now()
// );
//
// create table cohort_members (
//   id          uuid primary key default gen_random_uuid(),
//   cohort_id   uuid not null references cohorts(id) on delete cascade,
//   user_email  text not null,
//   added_at    timestamptz not null default now(),
//   unique(cohort_id, user_email)
// );

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: cohorts, error } = await db.from("cohorts").select("*").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ cohorts: [] });

  const { data: members } = await db.from("cohort_members").select("cohort_id");
  const counts: Record<string, number> = {};
  for (const m of members ?? []) counts[m.cohort_id] = (counts[m.cohort_id] ?? 0) + 1;

  return NextResponse.json({ cohorts: (cohorts ?? []).map(c => ({ ...c, member_count: counts[c.id] ?? 0 })) });
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, color } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db.from("cohorts").insert({
    name:        name.trim(),
    description: description?.trim() ?? "",
    color:       color ?? "#e8620a",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cohort: { ...data, member_count: 0 } });
}
