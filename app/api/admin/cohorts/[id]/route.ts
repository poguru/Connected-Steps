import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET — members of a cohort
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: rows } = await db.from("cohort_members").select("user_email, added_at").eq("cohort_id", id);
  if (!rows?.length) return NextResponse.json({ members: [] });

  const emails = rows.map(r => r.user_email);
  const { data: users } = await db.from("users").select("email, first_name, last_name, phone").in("email", emails);
  const uMap = Object.fromEntries((users ?? []).map(u => [u.email, u]));

  return NextResponse.json({
    members: rows.map(r => {
      const u = uMap[r.user_email];
      return { email: r.user_email, name: u ? `${u.first_name} ${u.last_name}` : r.user_email, phone: u?.phone ?? "", added_at: r.added_at };
    }),
  });
}

// PUT — add or remove members  { action: "add"|"remove", emails: string[] }
export async function PUT(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { action, emails } = await req.json().catch(() => ({} as { action?: string; emails?: string[] }));
  if (!action || !Array.isArray(emails)) return NextResponse.json({ error: "action and emails required" }, { status: 400 });

  const db = getSupabaseServer();
  if (action === "add") {
    await db.from("cohort_members").upsert(
      emails.map(e => ({ cohort_id: id, user_email: e.toLowerCase() })),
      { onConflict: "cohort_id,user_email", ignoreDuplicates: true },
    );
  } else {
    await db.from("cohort_members").delete().eq("cohort_id", id).in("user_email", emails);
  }
  return NextResponse.json({ success: true });
}

// DELETE — delete cohort and its members
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();
  await db.from("cohort_members").delete().eq("cohort_id", id);
  await db.from("cohorts").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
