"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import OpsHeader from "@/components/ops/OpsHeader";
import type { OpsRole } from "@/lib/ops-auth";

const ACCENT = "#a78bfa";

interface Session { uid: string; eid: string; role: OpsRole; email: string; name: string; }

interface Participant {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  distance_category: string | null;
  tshirt_size: string | null;
  bib_number: string | null;
  checked_in_at: string | null;
  tshirt_issued: boolean;
  breakfast_availed: boolean;
  medal_issued: boolean;
  bib_collected_at: string | null;
  payment_status: string;
  registration_code: string;
  status: string;
}

interface SearchResponse {
  participants: Participant[];
  total: number;
  page: number;
  total_pages: number;
}

const STATUS_DOT: Record<string, string> = {
  paid:    "#4ade80",
  pending: "#fbbf24",
  failed:  "#f87171",
};

export default function RegistrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router   = useRouter();

  const [session,    setSession]    = useState<Session | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [q,          setQ]          = useState("");
  const [data,       setData]       = useState<SearchResponse | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [page,       setPage]       = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string, pg: number, eid: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, page: String(pg), limit: "25" });
      const res  = await fetch(`/api/ops/events/${eid}/registrations?${params.toString()}`);
      if (res.ok) setData(await res.json() as SearchResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/ops/auth")
      .then(r => r.ok ? r.json() : null)
      .then((s: Session | null) => {
        if (!s) { router.replace(`/ops/${slug}/login`); return; }
        setSession(s);
        void search("", 1, s.eid);
      })
      .catch(() => router.replace(`/ops/${slug}/login`));

    fetch(`/api/events/by-slug?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { event?: { title: string } } | null) => { if (d?.event?.title) setEventTitle(d.event.title); })
      .catch(() => {});
  }, [slug, router, search]);

  function handleSearch(val: string) {
    setQ(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (session) void search(val, 1, session.eid);
    }, 300);
  }

  function changePage(pg: number) {
    setPage(pg);
    if (session) void search(q, pg, session.eid);
  }

  if (!session) return <Spinner />;

  const rows = data?.participants ?? [];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <OpsHeader slug={slug} eventTitle={eventTitle} role={session.role} volunteerName={session.name}
        countLabel={data ? `${data.total} participants` : undefined} accentColor={ACCENT} />

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "clamp(1rem,4vw,1.5rem) 16px 80px" }}>
        {/* Search */}
        <input
          type="search" autoFocus
          value={q} onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name, email, BIB number…"
          style={{
            width: "100%", padding: "12px 16px", boxSizing: "border-box",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12, color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none",
            marginBottom: 16,
          }}
        />

        {/* Results */}
        {loading && rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#555" }}>Searching…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#555" }}>
            {q ? "No participants found." : "No participants yet."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map(p => (
              <div key={p.id} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#eee" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {p.registration_code}
                      {p.distance_category ? ` · ${p.distance_category}` : ""}
                      {p.bib_number ? ` · BIB #${p.bib_number}` : ""}
                    </div>
                    {p.email && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{p.email}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <StatusChip color={STATUS_DOT[p.payment_status] ?? "#888"} label={p.payment_status} />
                    {p.tshirt_size && <Chip label={`👕 ${p.tshirt_size}`} />}
                  </div>
                </div>

                {/* Service badges */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  <ServiceBadge done={!!p.checked_in_at}    label="Check-In"  color="#10b981" />
                  <ServiceBadge done={p.tshirt_issued}      label="T-Shirt"   color="#f59e0b" />
                  <ServiceBadge done={p.breakfast_availed}  label="Breakfast" color="#f97316" />
                  <ServiceBadge done={p.medal_issued}       label="Medal"     color="#fbbf24" />
                  <ServiceBadge done={!!p.bib_collected_at} label="BIB"       color="#60a5fa" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {(data?.total_pages ?? 0) > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {Array.from({ length: data!.total_pages }, (_, i) => i + 1).map(pg => (
              <button key={pg} onClick={() => changePage(pg)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: pg === page ? ACCENT : "rgba(255,255,255,0.05)",
                  border: `1px solid ${pg === page ? ACCENT : "rgba(255,255,255,0.1)"}`,
                  color: pg === page ? "#fff" : "#888", cursor: "pointer", fontFamily: "inherit",
                }}>
                {pg}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
      background: `${color}18`, border: `1px solid ${color}40`, color }}>
      {label}
    </span>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa" }}>
      {label}
    </span>
  );
}

function ServiceBadge({ done, label, color }: { done: boolean; label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: done ? `${color}18` : "rgba(255,255,255,0.03)",
      border: `1px solid ${done ? color + "40" : "rgba(255,255,255,0.07)"}`,
      color: done ? color : "#444",
    }}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#a78bfa", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
