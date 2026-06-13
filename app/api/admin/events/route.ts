import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function uniqueSlug(db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (attempt < 10) {
    const { data } = await db.from("events").select("id").eq("share_slug", slug).single();
    if (!data) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
  return `${base}-${Date.now()}`;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    title, description, event_type, cover_image,
    start_date, start_time, end_date, end_time,
    location, organizer, max_participants,
    registration_required,
    price, featured, terms_conditions, maps_url,
  } = body;

  if (!title || !location || !start_date) {
    return NextResponse.json({ error: "Title, location, and start date are required." }, { status: 400 });
  }

  const db   = getSupabaseServer();
  const slug = await uniqueSlug(db, toSlug(title));

  const { data, error } = await db
    .from("events")
    .insert({
      title:                title.trim(),
      description:          description || null,
      event_type:           event_type || "running",
      cover_image:          cover_image || null,
      start_date,
      start_time:           start_time || null,
      end_date:             end_date || null,
      end_time:             end_time || null,
      location:             location.trim(),
      organizer:            organizer || null,
      max_participants:     max_participants ? Number(max_participants) : null,
      registration_required: registration_required !== false,
      price:                Number(price) || 0,
      featured:             featured === true,
      terms_conditions:     terms_conditions || null,
      maps_url:             maps_url || null,
      status:               "draft",
      share_slug:           slug,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("events")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getSupabaseServer();

  // Delete registrations first — event_registrations has ON DELETE RESTRICT so
  // Supabase would block the event delete if any registrations exist.
  // event_rsvp has ON DELETE CASCADE so it cleans itself up automatically.
  await db.from("event_registrations").delete().eq("event_id", id);

  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
