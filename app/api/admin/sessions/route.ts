import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  sendWhatsApp, sendSMS, sendEmail,
  sessionWAParams, sessionSMSText, sessionEmailHTML,
} from "@/lib/notify";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("sessions")
    .select("*")
    .order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title, date, location } = await req.json();
  if (!title || !date || !location) {
    return NextResponse.json({ error: "title, date and location are required." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("sessions")
    .insert({ title, date, location })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire notifications after responding — don't block the admin UI
  notifyUsers(db, title, date, location).catch((e) =>
    console.error("Session notification error:", e)
  );

  return NextResponse.json({ data });
}

async function notifyUsers(
  db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  title: string,
  date: string,
  location: string
) {
  // Fetch users at this training location
  const { data: users } = await db
    .from("users")
    .select("first_name, last_name, email, phone")
    .ilike("location", `%${location}%`);

  if (!users || users.length === 0) {
    console.log(`No users found for location: ${location}`);
    return;
  }

  const tasks: Promise<{ to: string; channel: string; ok: boolean; error?: string }>[] = [];

  for (const u of users) {
    const name = `${u.first_name} ${u.last_name}`.trim() || "there";

    // WhatsApp — if phone exists
    if (u.phone?.trim()) {
      tasks.push(sendWhatsApp(u.phone, sessionWAParams(name, title, date, location)));
    }

    // SMS — if phone exists
    if (u.phone?.trim()) {
      tasks.push(sendSMS(u.phone, sessionSMSText(name, title, date, location)));
    }

    // Email — if email exists
    if (u.email?.trim()) {
      tasks.push(
        sendEmail(
          u.email,
          name,
          `New Training Session: ${title}`,
          sessionEmailHTML(name, title, date, location)
        )
      );
    }
  }

  const results = await Promise.allSettled(tasks);

  let wa = 0, sms = 0, email = 0, failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.ok) {
        if (r.value.channel === "whatsapp") wa++;
        else if (r.value.channel === "sms")  sms++;
        else                                  email++;
      } else {
        failed++;
        console.warn(`Notify failed [${r.value.channel}] → ${r.value.to}: ${r.value.error}`);
      }
    } else {
      failed++;
    }
  }

  console.log(`Notifications sent — WhatsApp: ${wa}, SMS: ${sms}, Email: ${email}, Failed: ${failed}`);
}
