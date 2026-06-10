"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import FeedItem from "./FeedItem";
import type { FeedEvent } from "@/app/api/feed/route";

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonItem({ compact }: { compact: boolean }) {
  const h = compact ? 68 : 96;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", height: h, display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem" }}>
      <div style={{ width: compact ? 32 : 40, height: compact ? 32 : 40, borderRadius: "50%", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: "55%", height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 6 }} />
        <div style={{ width: "32%", height: 8,  background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ scope, onDiscover }: { scope: "following" | "global"; onDiscover?: () => void }) {
  const router = useRouter();
  if (scope === "global") {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "2.5rem 1.5rem", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>⚡</div>
        <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>No activity yet</div>
        <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Be the first — join a session this weekend.</div>
      </div>
    );
  }
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "2rem 1.25rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
      <span style={{ fontSize: "1.4rem" }}>👥</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 2 }}>No activity yet</div>
        <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.4 }}>Follow other runners to see their sessions and photos here.</div>
      </div>
      <button
        onClick={onDiscover ?? (() => router.push("/community"))}
        style={{ flexShrink: 0, padding: "7px 14px", background: "var(--gradient-accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)", whiteSpace: "nowrap" }}>
        Find runners
      </button>
    </div>
  );
}

// ── ActivityFeed ──────────────────────────────────────────────────────────────

interface Props {
  currentUserEmail:  string;
  scope?:            "following" | "global";
  compact?:          boolean;    // dashboard widget layout
  maxItems?:         number;     // cap for widget (no infinite scroll)
  onDiscoverClick?:  () => void; // override navigation in Community tab
  showViewAll?:      boolean;    // show "View full feed →" link at bottom
}

export default function ActivityFeed({
  currentUserEmail,
  scope = "following",
  compact = false,
  maxItems,
  onDiscoverClick,
  showViewAll = false,
}: Props) {
  const [events,     setEvents]     = useState<FeedEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore,    setHasMore]    = useState(false);
  const [error,      setError]      = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchedRef  = useRef(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({
      email: currentUserEmail,
      scope,
      limit: String(maxItems ? Math.min(maxItems, 15) : 15),
    });
    if (cursor) params.set("before", cursor);

    const res  = await fetch(`/api/feed?${params}`);
    const data = await res.json();
    return data as { events: FeedEvent[]; next_cursor: string | null; has_more: boolean };
  }, [currentUserEmail, scope, maxItems]);

  // Initial load
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetchPage()
      .then(d => {
        setEvents(d.events ?? []);
        setNextCursor(d.next_cursor);
        setHasMore(d.has_more);
      })
      .catch(() => setError("Failed to load feed."))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  // Infinite scroll: observe sentinel at bottom
  useEffect(() => {
    if (compact || maxItems || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && nextCursor) {
          setLoadingMore(true);
          fetchPage(nextCursor)
            .then(d => {
              setEvents(prev => {
                const ids = new Set(prev.map(e => e.id));
                const fresh = (d.events ?? []).filter(e => !ids.has(e.id));
                return [...prev, ...fresh];
              });
              setNextCursor(d.next_cursor);
              setHasMore(d.has_more);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, nextCursor, fetchPage, compact, maxItems]);

  const displayEvents = maxItems ? events.slice(0, maxItems) : events;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? "0.5rem" : "0.65rem" }}>
        {Array.from({ length: compact ? 3 : 4 }).map((_, i) => <SkeletonItem key={i} compact={compact} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", padding: "1rem", textAlign: "center" }}>{error}</div>
    );
  }

  if (displayEvents.length === 0) {
    return <EmptyState scope={scope} onDiscover={onDiscoverClick} />;
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? "0.5rem" : "0.65rem" }}>
        {displayEvents.map(event => (
          <FeedItem
            key={event.id}
            event={event}
            currentUserEmail={currentUserEmail}
            compact={compact}
          />
        ))}
      </div>

      {/* Load more sentinel */}
      {!compact && !maxItems && <div ref={sentinelRef} style={{ height: 1 }} />}

      {/* Loading more indicator */}
      {loadingMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
            Loading more…
          </div>
        </div>
      )}

      {/* End of feed message */}
      {!compact && !maxItems && !hasMore && events.length > 0 && (
        <div style={{ textAlign: "center", padding: "1.5rem 0 0.5rem", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
          You&apos;re all caught up 🎉
        </div>
      )}

      {/* View all link for widget */}
      {showViewAll && maxItems && events.length >= maxItems && (
        <a
          href="/feed"
          style={{ display: "block", textAlign: "center", marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--cs-orange)", textDecoration: "none", fontWeight: 600 }}>
          See full community feed →
        </a>
      )}
    </div>
  );
}
