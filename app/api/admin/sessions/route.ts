import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendWhatsApp, sessionMessage } from "@/lib/notify";

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

  // Create the session
  const { data, error } = await db
    .from("sessions")
    .insert({ title, date, location })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify users at this location (fire-and-forget — don't block the response)
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
  // Fetch users at this training location who have a phone number
  const { data: users } = await db
    .from("users")
    .select("first_name, last_name, phone")
    .ilike("location", `%${location}%`)
    .not("phone", "is", null);

  if (!users || users.length === 0) return;

  const results = await Promise.allSettled(
    users
      .filter((u) => u.phone?.trim())
      .map((u) => {
        const name = `${u.first_name} ${u.last_name}`.trim() || "there";
        const msg  = sessionMessage(name, title, date, location);
        return sendWhatsApp(u.phone!, msg);
      })
  );

  const sent   = results.filter((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok).length;
  const failed = results.length - sent;
  console.log(`Session notifications: ${sent} sent, ${failed} failed`);
}
