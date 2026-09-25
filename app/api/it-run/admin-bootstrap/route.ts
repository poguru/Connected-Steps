/**
 * ONE-TIME admin bootstrap endpoint.
 * Creates or resets the super_admin portal user using the server's own
 * SECRET() function, so the password hash always matches production.
 *
 * Protected by RAZORPAY_WEBHOOK_SECRET (only the site owner knows this).
 *
 * DELETE THIS FILE after creating the admin account.
 *
 * Usage (curl):
 *   curl -X POST https://www.connectedsteps.in/api/it-run/admin-bootstrap \
 *     -H "Content-Type: application/json" \
 *     -d '{"bootstrapKey":"<RAZORPAY_WEBHOOK_SECRET>","email":"you@example.com","name":"Super Admin","password":"YourPassword"}'
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer }         from "@/lib/supabase-server";
import { hashPassword }              from "@/lib/it-run-auth";

export async function POST(req: NextRequest) {
  try {
    const { bootstrapKey, email, name, password } = await req.json() as {
      bootstrapKey: string;
      email:        string;
      name:         string;
      password:     string;
    };

    // Auth: caller must supply the Razorpay webhook secret
    const expectedKey = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!expectedKey || bootstrapKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!email || !name || !password) {
      return NextResponse.json({ error: "email, name, and password are required" }, { status: 400 });
    }

    const db           = getSupabaseServer();
    const passwordHash = hashPassword(password);

    const { data, error } = await db
      .from("it_run_portal_users")
      .upsert(
        { email: email.toLowerCase().trim(), name, role: "super_admin", password_hash: passwordHash, is_active: true },
        { onConflict: "email" },
      )
      .select("id, email, name, role")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: data });
  } catch (e: unknown) {
    console.error("[admin-bootstrap] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
