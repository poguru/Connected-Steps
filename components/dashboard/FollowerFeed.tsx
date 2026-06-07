"use client";

import { useEffect, useState } from "react";

interface FeedEvent {
  id:          string;
  actor_email: string;
  actor_name:  string;
  event_type:  "session_attended" | "photo_uploaded" | "badge_earned";
  payload:     Record<string, string | number>;
  created_at:  string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: "30px", height: "30px", borderRadius: "50%",
      background: "oklch(0.72 0.19 49 / 15%)",
      border: "1px solid oklch(0.72 0.19 49 / 25%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "0.72rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0,
    }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default function FollowerFeed({ userEmail }: { userEmail: string }) {
  const [events,  setEvents]  = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/feed?email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [userEmail]);

  if (loading || events.length === 0) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: "1.25rem", overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
      <div style={{ padding: "0.9rem 1.25rem 0.5rem", fontSize: "10px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
        Following Activity
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {events.map((event, i) => (
          <div
            key={event.id}
            style={{
              display: "flex", gap: "0.65rem", padding: "0.7rem 1.25rem",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
              alignItems: "flex-start",
            }}
          >
            <Avatar name={event.actor_name} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cs-white)", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{event.actor_name}</span>
                {event.event_type === "session_attended" && (
                  <>
                    {" "}attended{" "}
                    <span style={{ color: "var(--cs-orange)" }}>
                      {event.payload.session_title as string}
                    </span>
                  </>
                )}
                {event.event_type === "photo_uploaded" && (
                  <> uploaded a photo</>
                )}
              </div>
              <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px" }}>
                {timeAgo(event.created_at)}
              </div>
            </div>

            {event.event_type === "photo_uploaded" && event.payload.photo_url && (
              <img
                src={event.payload.photo_url as string}
                alt={event.payload.caption as string || "Session photo"}
                style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
