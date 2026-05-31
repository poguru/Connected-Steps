import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendWhatsApp, sessionWAParams } from "@/lib/notify";

webpush.setVapidDetails(
  "mailto:connected.steps2106@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

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
  const { title, date, time, location, venue } = await req.json();
  if (!title || !date || !location) {
    return NextResponse.json({ error: "title, date and location are required." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("sessions")
    .insert({ title, date, time: time || null, location, venue: venue || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notifications paused — enable when MSG91 templates are approved
  // await notifyUsers(db, data.id, title, date, time || null, venue || location, location).catch(console.error);

  return NextResponse.json({ data });
}

async function notifyUsers(
  db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  sessionId: string,
  title: string,
  date: string,
  time: string | null,
  displayLocation: string,
  filterLocation: string
) {
  // Fetch users at this location
  const { data: users } = await db
    .from("users")
    .select("first_name, last_name, email, phone")
    .ilike("location", `%${filterLocation}%`);

  if (!users || users.length === 0) {
    console.log(`No users found for location: ${filterLocation}`);
    return;
  }

  // ── WhatsApp ──
  const waResults = await Promise.allSettled(
    users
      .filter((u) => u.phone?.trim())
      .map((u) => {
        const name = `${u.first_name} ${u.last_name}`.trim() || "there";
        return sendWhatsApp(u.phone!, sessionWAParams(name, title, date, time, displayLocation, sessionId));
      })
  );
  const waSent = waResults.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  const waErrors = waResults
    .filter((r) => r.status === "fulfilled" && !r.value.ok)
    .map((r) => (r as PromiseFulfilledResult<{ ok: boolean; error?: string; to: string }>).value)
    .map((v) => `${v.to}: ${v.error}`);
  console.log(`WhatsApp: ${waSent}/${waResults.length} sent`);
  if (waErrors.length) console.error("WhatsApp errors:", waErrors.join(" | "));

  // ── Push notifications ──
  const emails = users.map((u) => u.email?.toLowerCase()).filter(Boolean);
  if (emails.length > 0) {
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("subscription")
      .in("user_email", emails);

    if (subs && subs.length > 0) {
      const payload = JSON.stringify({
        title: "New Session – Connected Steps",
        body:  `${title} at ${displayLocation}. Tap to join.`,
        icon:  "/logo.png",
        url:   `/join/${sessionId}`,
      });

      const pushResults = await Promise.allSettled(
        subs.map((s) => webpush.sendNotification(s.subscription, payload))
      );
      const pushSent = pushResults.filter((r) => r.status === "fulfilled").length;
      console.log(`Push: ${pushSent}/${subs.length} sent`);
    }
  }
}
