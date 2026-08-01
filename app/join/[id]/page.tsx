import { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";
import JoinClient from "./JoinClient";

import { APP_URL } from "@/lib/config";
async function getSession(id: string) {
  const db = getSupabaseServer();
  const { data } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location, photo_url")
    .eq("id", id)
    .single();
  return data;
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
  const title    = session.title;
  const desc     = `📅 ${dateStr}${timeStr} · 📍 ${venue}. Join the Connected Steps community run.`;
  const pageUrl  = `${APP_URL}/join/${id}`;
  const ogImage  = `${APP_URL}/api/og/session/${id}`;

  return {
    title: `${title} – Connected Steps`,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url:         pageUrl,
      siteName:    "Connected Steps",
      images:      [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type:        "website",
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description: desc,
      images:      [ogImage],
    },
  };
}

export default async function JoinSessionPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return <JoinClient id={id} />;
}
