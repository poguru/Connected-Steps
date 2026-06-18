"use client";

import { useEffect, useState } from "react";

interface Suggestion {
  email:    string;
  name:     string;
  location: string;
  points:   number;
}

export default function PeopleYouMayKnow({ userEmail }: { userEmail: string }) {
  const [suggestions,  setSuggestions]  = useState<Suggestion[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [busySet,      setBusySet]      = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/users/suggestions?email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(d => setSuggestions(d.users ?? []));
  }, [userEmail]);

  if (suggestions.length === 0) return null;

  async function toggleFollow(targetEmail: string) {
    setBusySet(prev => new Set(prev).add(targetEmail));
    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
      const res  = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": token },
        body: JSON.stringify({ following_email: targetEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setFollowingSet(prev => {
          const next = new Set(prev);
          data.action === "followed" ? next.add(targetEmail) : next.delete(targetEmail);
          return next;
        });
      }
    } finally {
      setBusySet(prev => { const next = new Set(prev); next.delete(targetEmail); return next; });
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, marginBottom: "0.75rem", overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
      <div style={{ padding: "0.9rem 1.1rem 0.5rem", fontSize: "10px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
        People you may know
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {suggestions.map((u, i) => {
          const following = followingSet.has(u.email);
          const busy      = busySet.has(u.email);
          return (
            <div key={u.email} style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.65rem 1.1rem", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              {/* Avatar */}
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
                {u.name?.[0]?.toUpperCase() ?? "?"}
              </div>

              {/* Name + location */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--cs-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                {u.location && <div style={{ fontSize: "10px", color: "var(--cs-muted)" }}>📍 {u.location}</div>}
              </div>

              {/* Follow button */}
              <button
                onClick={() => toggleFollow(u.email)}
                disabled={busy}
                style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", border: "1px solid", transition: "all 0.15s", opacity: busy ? 0.6 : 1,
                  background:  following ? "transparent"             : "var(--gradient-accent)",
                  color:       following ? "var(--cs-muted)"         : "#fff",
                  borderColor: following ? "var(--border)"           : "transparent",
                }}
              >
                {busy ? "…" : following ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
