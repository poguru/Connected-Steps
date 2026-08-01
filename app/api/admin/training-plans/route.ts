import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

import { APP_URL } from "@/lib/config";
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("training_plans")
    .select("id, user_email, title, coach_name, active, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { user_email, title, coach_name, days } = body as {
    user_email: string;
    title:      string;
    coach_name: string;
    days:       { type: string; detail: string; emoji: string }[];
  };

  if (!user_email || !Array.isArray(days) || days.length !== 7) {
    return NextResponse.json({ error: "user_email and 7 days required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Deactivate all previous plans for this user
  await db.from("training_plans").update({ active: false }).eq("user_email", user_email.toLowerCase());

  const { data, error } = await db.from("training_plans").insert({
    user_email:  user_email.toLowerCase(),
    title:       title || "Weekly Plan",
    coach_name:  coach_name || "",
    days,
    active:      true,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Fetch user's name for personalised email
  const { data: user } = await db
    .from("users")
    .select("first_name")
    .eq("email", user_email.toLowerCase())
    .single();

  // Fire-and-forget email notification
  sendTrainingPlanEmail({
    email:      user_email.toLowerCase(),
    firstName:  user?.first_name ?? "",
    title:      title || "Weekly Plan",
    coach_name: coach_name || "",
    days,
  }).catch(() => {});

  return NextResponse.json({ plan: data });
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function sendTrainingPlanEmail(p: {
  email:      string;
  firstName:  string;
  title:      string;
  coach_name: string;
  days:       { type: string; detail: string; emoji: string }[];
}) {
  const appUrl = APP_URL;
  const firstName = p.firstName || "there";

  const dayRows = p.days.map((d, i) => {
    const isRest = d.type.toLowerCase().includes("rest");
    return `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="padding:10px 14px;font-size:13px;color:#888;white-space:nowrap;width:110px;">${DAY_NAMES[i]}</td>
        <td style="padding:10px 14px;font-size:13px;">
          <span style="margin-right:6px;">${d.emoji}</span>
          <span style="color:${isRest ? "#666" : "#e0e0e0"};">${d.type}</span>
        </td>
        <td style="padding:10px 14px;font-size:12px;color:#999;line-height:1.5;">${isRest ? "â€”" : d.detail}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d0d;border-radius:10px;overflow:hidden;">
      <!-- Header -->
      <div style="background:#111;padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:1rem;font-weight:700;color:#fff;">Connected Steps</span>
      </div>

      <!-- Body -->
      <div style="padding:28px;">
        <p style="color:#e0e0e0;margin:0 0 6px;">Hi <strong>${firstName}</strong>,</p>
        <p style="color:#e0e0e0;margin:0 0 20px;">Your coach has published a new training plan for you. Here's what your week looks like:</p>

        <!-- Plan header -->
        <div style="margin-bottom:16px;">
          <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px;">${p.title}</div>
          ${p.coach_name ? `<div style="font-size:12px;color:#ff7a00;">By ${p.coach_name}</div>` : ""}
        </div>

        <!-- Week table -->
        <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <thead>
            <tr style="background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.08);">
              <th style="padding:10px 14px;font-size:11px;color:#888;text-align:left;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Day</th>
              <th style="padding:10px 14px;font-size:11px;color:#888;text-align:left;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Type</th>
              <th style="padding:10px 14px;font-size:11px;color:#888;text-align:left;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Details</th>
            </tr>
          </thead>
          <tbody>${dayRows}</tbody>
        </table>

        <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 28px;background:#ff7a00;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
          View on Dashboard â†’
        </a>

        <p style="color:#555;font-size:12px;margin-top:28px;">
          You can always find your current training plan in the <em>Training Plan</em> section of your dashboard.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="color:#444;font-size:11px;margin:0;">Connected Steps Â· <a href="${appUrl}" style="color:#ff7a00;text-decoration:none;">connectedsteps.in</a></p>
      </div>
    </div>
  `;

  const { sendSingleEmail } = await import("@/lib/email-service");
  await sendSingleEmail({ to: p.email, subject: `Your training plan is ready â€” ${p.title}`, html });
}
