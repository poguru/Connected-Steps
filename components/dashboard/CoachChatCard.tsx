"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Coach {
  id: string;
  name: string;
  specialization: string | null;
  avatar_url: string | null;
}

interface Conversation {
  id: string;
  user_unread: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  coaches: Coach | null;
}

export default function CoachChatCard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [conv, setConv] = useState<Conversation | null | undefined>(undefined);
  const [coach, setCoach] = useState<Coach | null>(null);

  useEffect(() => {
    const token = (typeof localStorage !== "undefined" ? localStorage.getItem("cs_user_token") : null) ?? "";
    fetch("/api/messages/conversations", { headers: { "x-user-token": token } })
      .then(r => r.json())
      .then(d => {
        const convs: Conversation[] = d.conversations ?? [];
        if (convs.length > 0) {
          setConv(convs[0]);
          setCoach(convs[0].coaches ?? null);
        } else {
          setConv(null);
          fetch("/api/coaches")
            .then(r => r.json())
            .then(d => { if (d.coaches?.length) setCoach(d.coaches[0]); })
            .catch(() => {});
        }
      })
      .catch(() => setConv(null));
  }, [userEmail]);

  if (conv === undefined) return null;

  const unread = conv?.user_unread ?? 0;
  const preview = conv?.last_message_preview ?? null;
  const displayName = coach?.name ?? "Your Coach";
  const displayRole = coach?.specialization ?? "Running Coach";

  function initials(name: string) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div
      onClick={() => router.push("/messages")}
      style={{
        background: "linear-gradient(135deg, oklch(0.17 0.018 270) 0%, oklch(0.20 0.022 285) 100%)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "0.9rem 1rem",
        marginBottom: "1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        cursor: "pointer",
        boxShadow: "var(--shadow-md)",
        transition: "border-color 0.15s",
        position: "relative",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.72 0.19 49 / 40%)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
    >
      {/* Coach avatar */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {coach?.avatar_url ? (
          <img
            src={coach.avatar_url}
            alt={displayName}
            style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)", display: "block" }}
          />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "2px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", fontWeight: 800, color: "var(--cs-orange)" }}>
            {initials(displayName)}
          </div>
        )}
        {/* Online indicator */}
        <div style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: "#4ade80", border: "2px solid var(--background)" }} />
      </div>

      {/* Coach info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "9px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>
          My Coach
        </div>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {displayName}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
          {unread > 0
            ? <span style={{ color: "var(--cs-orange)", fontWeight: 600 }}>{unread} new message{unread > 1 ? "s" : ""}</span>
            : preview
            ? preview
            : displayRole}
        </div>
      </div>

      {/* Chat button + unread badge */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {unread > 0 && (
          <div style={{ background: "var(--cs-orange)", color: "var(--accent-foreground)", borderRadius: "999px", fontSize: "10px", fontWeight: 800, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
            {unread}
          </div>
        )}
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--cs-orange)", display: "flex", alignItems: "center", gap: 2 }}>
          Chat
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
