import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "info@connectedsteps.in";

async function notifyAdmin(p: { user_name: string; user_email: string; category: string; question: string }) {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.in>";
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from, to: [ADMIN_EMAIL],
      subject: `New coach question from ${p.user_name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;">
          <div style="background:#0d0d0d;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <span style="font-size:1rem;font-weight:700;color:#fff;">Connected Steps</span>
            <span style="font-size:0.8rem;color:#888;margin-left:8px;">Ask Your Coach</span>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:0.9rem;color:#ccc;"><strong style="color:#fff;">${p.user_name}</strong> (${p.user_email}) sent a new question.</p>
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;margin-bottom:16px;">
              <div style="font-size:10px;color:#e8620a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${p.category}</div>
              <div style="font-size:0.9rem;color:#ddd;line-height:1.6;">${p.question}</div>
            </div>
            <a href="https://www.connectedsteps.in/admin/coach-questions" style="display:inline-block;padding:10px 24px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-size:0.85rem;font-weight:600;">Reply in Admin →</a>
          </div>
        </div>`,
    }),
  });
}

// GET /api/coach-questions — requires auth (401 for missing email/token)
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = getSupabaseServer();

    let q = db
      .from("coach_questions")
      .select("id, user_email, user_name, category, question, answer, answered_at, status, created_at")
      .order("created_at", { ascending: false });

    if (email) q = q.eq("user_email", email);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ questions: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/coach-questions — requires active membership (403 for free users)
export async function POST(req: NextRequest) {
  try {
    const { user_email, user_name, category, question } = await req.json();
    if (!user_email || !question?.trim()) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Membership gate: coach Q&A is a paid-member feature
    const { data: membership } = await db
      .from("memberships")
      .select("status, expires_at")
      .eq("user_email", (user_email as string).toLowerCase())
      .maybeSingle();
    const hasActiveMembership =
      membership?.status === "active" && new Date(membership.expires_at) > new Date();
    if (!hasActiveMembership) {
      return NextResponse.json(
        { error: "Active membership required to submit coach questions." },
        { status: 403 }
      );
    }
    const { data, error } = await db
      .from("coach_questions")
      .insert({ user_email, user_name, category: category || "General", question: question.trim(), status: "pending" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify admin — fire and forget
    notifyAdmin({ user_name, user_email, category: category || "General", question: question.trim() }).catch(() => {});

    return NextResponse.json({ question: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
