import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { answer } = await req.json();
    if (!answer?.trim()) {
      return NextResponse.json({ error: "Answer cannot be empty." }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { data, error } = await db
      .from("coach_questions")
      .update({ answer: answer.trim(), answered_at: new Date().toISOString(), status: "answered" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fire-and-forget email — don't block the response
    sendCoachReplyEmail(data).catch(() => {});

    return NextResponse.json({ question: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function sendCoachReplyEmail(q: {
  user_email: string;
  user_name:  string;
  category:   string;
  question:   string;
  answer:     string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.in>";
  const firstName = q.user_name?.split(" ")[0] || "there";

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:0;background:#0d0d0d;border-radius:10px;overflow:hidden;">
      <!-- Header -->
      <div style="background:#111;padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:1rem;font-weight:700;color:#fff;">Connected Steps</span>
      </div>

      <!-- Body -->
      <div style="padding:28px;">
        <p style="color:#e0e0e0;margin:0 0 20px;">Hi <strong>${firstName}</strong>,</p>
        <p style="color:#e0e0e0;margin:0 0 20px;">Your coach has replied to your question. Here's a summary:</p>

        <!-- Question -->
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px 18px;margin-bottom:14px;">
          <div style="font-size:11px;color:#ff7a00;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">${q.category}</div>
          <div style="font-size:14px;color:#ccc;line-height:1.6;">${q.question}</div>
        </div>

        <!-- Answer -->
        <div style="background:rgba(255,122,0,0.07);border:1px solid rgba(255,122,0,0.25);border-radius:8px;padding:16px 18px;margin-bottom:24px;">
          <div style="font-size:11px;color:#ff7a00;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Coach Reply</div>
          <div style="font-size:14px;color:#e0e0e0;line-height:1.7;">${q.answer}</div>
        </div>

        <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 28px;background:#ff7a00;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
          Open Dashboard →
        </a>

        <p style="color:#555;font-size:12px;margin-top:28px;">
          You can view all your coach conversations in the <em>My Questions</em> tab of the Ask Your Coach section on your dashboard.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="color:#444;font-size:11px;margin:0;">Connected Steps · <a href="${appUrl}" style="color:#ff7a00;text-decoration:none;">connectedsteps.in</a></p>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [q.user_email],
      subject: `Coach replied to your question — Connected Steps`,
      html,
    }),
  });
}
