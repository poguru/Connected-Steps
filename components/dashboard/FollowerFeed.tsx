"use client";

import ActivityFeed from "@/components/feed/ActivityFeed";

interface Props { userEmail: string }

export default function FollowerFeed({ userEmail }: Props) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
          Following Activity
        </span>
        <a
          href="/feed"
          style={{ fontSize: "10px", color: "var(--cs-orange)", textDecoration: "none", fontWeight: 600 }}>
          Full feed →
        </a>
      </div>
      <ActivityFeed
        currentUserEmail={userEmail}
        scope="following"
        compact={true}
        maxItems={5}
        showViewAll={true}
      />
    </div>
  );
}
