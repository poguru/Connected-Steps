import { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";
import JoinClient from "./JoinClient";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

async function getSession(id: string) {
  const db = getSupabaseServer();
  const { data } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location, photo_url")
    .eq("id", id)
    .single();
  return data;
}

async function getLatestPhoto() {
  const db = getSupabaseServer();
  const { data } = await db
    .from("sessions")
    .select("photo_url")
    .not("photo_url", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  return data?.photo_url ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return { title: "Session not found – Connected Steps" };
  }

  const dateStr = new Date(session.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeStr  = session.time ? ` at ${session.time}` : "";
  const venue    = session.venue || session.location;
  const photoUrl = session.photo_url ?? await getLatestPhoto();
  const title    = session.title;
  const desc     = `📅 ${dateStr}${timeStr} · 📍 ${venue}. Tap to register for this training session.`;
  const pageUrl  = `${APP_URL}/join/${id}`;

  const ogImages = photoUrl
    ? [{ url: photoUrl, width: 1200, height: 630, alt: session.title }]
    : [];

  return {
    title: `${title} – Connected Steps`,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url:         pageUrl,
      siteName:    "Connected Steps",
      images:      ogImages,
      type:        "website",
    },
    twitter: {
      card:        photoUrl ? "summary_large_image" : "summary",
      title,
      description: desc,
      images:      photoUrl ? [photoUrl] : [],
    },
  };
}

export default async function JoinSessionPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return <JoinClient id={id} />;
}
