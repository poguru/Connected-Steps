import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/coaches â€” list all coaches
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("coaches")
    .select("id, name, email, specialization, avatar_url, is_active, is_admin, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Enrich with whether they have a login (exist in users table with role=coach)
  const emails = (data ?? []).map(c => c.email);
  const { data: users } = await db
    .from("users")
    .select("email")
    .in("email", emails)
    .eq("role", "coach");

  const hasLogin = new Set((users ?? []).map(u => u.email));

  return NextResponse.json({
    coaches: (data ?? []).map(c => ({ ...c, has_login: hasLogin.has(c.email) })),
  });
}

// POST /api/admin/coaches â€” create or update coach login
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, email, password, specialization, phone } = await req.json();

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const emailClean  = email.toLowerCase().trim();
  const nameParts   = name.trim().split(" ");
  const firstName   = nameParts[0];
  const lastName    = nameParts.slice(1).join(" ") || "";
  const hashed      = await bcrypt.hash(password, 12);

  const { data: existing } = await db
    .from("users")
    .select("email, role")
    .eq("email", emailClean)
    .single();

  if (existing) {
    if (existing.role !== "coach") {
      return NextResponse.json(
        { error: "A non-coach account already exists with this email." },
        { status: 409 },
      );
    }
    // Reset password for existing coach
    const { error } = await db.from("users").update({ password: hashed }).eq("email", emailClean);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  } else {
    // Create new user with coach role
    const { error } = await db.from("users").insert({
      first_name: firstName,
      last_name:  lastName,
      email:      emailClean,
      phone:      phone?.trim() || "",
      password:   hashed,
      role:       "coach",
    });
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Upsert coaches profile row
  const { error: coachErr } = await db.from("coaches").upsert(
    {
      name:           name.trim(),
      email:          emailClean,
      specialization: specialization?.trim() || null,
      is_active:      true,
      is_admin:       false,
    },
    { onConflict: "email" },
  );

  if (coachErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
