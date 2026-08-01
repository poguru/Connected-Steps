import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";

import { APP_URL } from "@/lib/config";
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db     = getSupabaseServer();
  const { data: post } = await db.from("user_posts")
    .select("body, post_type, author_name, photo_url")
    .eq("id", id)
    .single();

  if (!post) return { title: "Post · Connected Steps" };

  const title       = `${post.author_name ?? "Community Member"} on Connected Steps`;
  const description = post.body.slice(0, 200);
  const imageUrl    = `${APP_URL}/api/og/post/${id}`;
  const pageUrl     = `${APP_URL}/s/post/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:    pageUrl,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
      type:   "article",
      siteName: "Connected Steps",
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      [imageUrl],
    },
  };
}

export default async function PublicPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db     = getSupabaseServer();
  const { data: post } = await db.from("user_posts")
    .select("body, post_type, author_name, photo_url, created_at")
    .eq("id", id)
    .single();

  if (!post) notFound();

  const firstName = (post.author_name ?? "Community Member").split(" ")[0] || "Member";

  const TYPE_EMOJI: Record<string, string> = {
    run: "🏃", achievement: "🏅", race: "🏁", question: "❓", birthday: "🎂", general: "💬",
  };
  const emoji = TYPE_EMOJI[post.post_type] ?? "💬";

  return (
    <div style={{ minHeight: "100svh", background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* Branding */}
      <Link href={APP_URL} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: "2rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8620a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff" }}>C</div>
        <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>Connected Steps</span>
      </Link>

      {/* Post card */}
      <div style={{ width: "100%", maxWidth: 560, background: "#161616", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "1rem 1.25rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(232,98,10,0.15)", border: "1.5px solid rgba(232,98,10,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, color: "#e8620a", flexShrink: 0 }}>
            {firstName[0]?.toUpperCase() ?? "M"}
          </div>
          <div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff" }}>{firstName}</div>
            <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{formatDate(post.created_at)}</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "1.4rem" }}>{emoji}</div>
        </div>

        {/* Body */}
        <div style={{ padding: "0 1.25rem 1rem", fontSize: "0.9rem", lineHeight: 1.65, color: "rgba(255,255,255,0.85)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {post.body}
        </div>

        {/* Photo */}
        {post.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.photo_url} alt="Post photo" style={{ width: "100%", maxHeight: 500, objectFit: "contain", background: "#0a0a0a", display: "block" }} />
        )}

        {/* CTA */}
        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <Link
            href={`${APP_URL}/community`}
            style={{
              display: "block", textAlign: "center", width: "100%",
              background: "#e8620a", color: "#fff",
              borderRadius: 10, padding: "12px",
              fontSize: "0.875rem", fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Join the Connected Steps Community →
          </Link>
        </div>
      </div>

      <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
        This post was shared from Connected Steps — Hyderabad&#39;s running community platform.
      </p>
    </div>
  );
}
