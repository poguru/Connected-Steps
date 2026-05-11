import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const { data: memberships, error } = await db
    .from("memberships")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with user details
  const emails = (memberships ?? []).map((m) => m.user_email);
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name, phone, location")
    .in("email", emails);

  const userMap = Object.fromEntries((users ?? []).map((u) => [u.email, u]));

  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const enriched = (memberships ?? []).map((m) => {
    const u = userMap[m.user_email] ?? {};
    const expiresAt = new Date(m.expires_at);
    const isActive  = m.status === "active" && expiresAt > now;
    const expiringSoon = isActive && expiresAt <= in7days;
    return {
      ...m,
      first_name:    u.first_name  ?? "",
      last_name:     u.last_name   ?? "",
      phone:         u.phone       ?? "",
      location:      u.location    ?? "",
      isActive,
      expiringSoon,
    };
  });

  const stats = {
    total:        enriched.length,
    active:       enriched.filter((m) => m.isActive).length,
    expired:      enriched.filter((m) => !m.isActive).length,
    expiringSoon: enriched.filter((m) => m.expiringSoon).length,
    revenue:      enriched.reduce((s, m) => s + (m.amount_paid ?? 0), 0),
  };

  return NextResponse.json({ memberships: enriched, stats });
}
