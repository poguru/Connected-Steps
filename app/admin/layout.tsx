"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ── Navigation structure ───────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    key:   "dashboard",
    label: null,
    icon:  null,
    links: [{ label: "Dashboard", href: "/admin", exact: true, icon: "⚡" }],
  },
  {
    key:   "events",
    label: "Events",
    icon:  "📅",
    links: [
      { label: "All Events",        href: "/admin/events",               exact: true,  icon: "🗓" },
      { label: "Registrations",   href: "/admin/events/registrations", exact: false, icon: "📋" },
      { label: "Scheduled Emails",href: "/admin/scheduled-emails",     exact: false, icon: "🕐" },
      { label: "Create Event",    href: "/admin/events/new",           exact: true,  icon: "➕" },
      { label: "Event Config",    href: "/admin/events/config",        exact: false, icon: "⚙️" },
    ],
  },
  {
    key:   "comms",
    label: "Communications",
    icon:  "📨",
    links: [
      { label: "Campaigns",       href: "/admin/campaigns",            exact: false, icon: "📣" },
      { label: "Comm Center",     href: "/admin/communication",        exact: true,  icon: "📨" },
      { label: "Consent Report",  href: "/api/admin/consent-report?format=csv", exact: true, icon: "📋" },
    ],
  },
  {
    key:   "operations",
    label: "Operations",
    icon:  "🏃",
    links: [
      { label: "Race Day",       href: "/admin/runs",     exact: false, icon: "🏁" },
      { label: "BIB Collection", href: "/admin/events",   exact: false, icon: "📦", note: "Via Event Hub" },
      { label: "Coach Ops",      href: "/admin/coach-ops",exact: false, icon: "🎯" },
    ],
  },
  {
    key:   "participants",
    label: "Participants",
    icon:  "👥",
    links: [
      { label: "Members",          href: "/admin/users",              exact: false, icon: "👤" },
      { label: "Coaches",          href: "/admin/coaches",            exact: false, icon: "🏅" },
      { label: "Coach Assignments",href: "/admin/coach-assignments",  exact: false, icon: "🔗" },
      { label: "Sessions",         href: "/admin/sessions",           exact: false, icon: "📍" },
      { label: "Daily QR",         href: "/admin/attendance-qr",      exact: false, icon: "📲" },
    ],
  },
  {
    key:   "community",
    label: "Community",
    icon:  "🤝",
    links: [
      { label: "Feed",              href: "/admin/community",      exact: false, icon: "📰" },
      { label: "Q&A",               href: "/admin/coach-questions",exact: false, icon: "❓" },
      { label: "Runner Stories",    href: "/admin/stories",        exact: false, icon: "📖" },
      { label: "Training Locations",href: "/admin/training-locations",exact:false,icon:"📍"},
      { label: "Training Plans",    href: "/admin/training-plans", exact: false, icon: "📄" },
      { label: "Coach Ratings",     href: "/admin/coach-ratings",  exact: false, icon: "⭐" },
    ],
  },
  {
    key:   "finance",
    label: "Finance",
    icon:  "💰",
    links: [
      { label: "Finance Dashboard",   href: "/admin/finance/dashboard",       exact: false, icon: "📊" },
      { label: "Invoices",            href: "/admin/finance",                 exact: true,  icon: "🧾" },
      { label: "Manual Invoices",      href: "/admin/finance/manual-invoices", exact: false, icon: "🧾" },
      { label: "Quotations",           href: "/admin/finance/quotations",      exact: false, icon: "📝" },
      { label: "Manual Payments",     href: "/admin/finance/manual-payments", exact: false, icon: "💵" },
      { label: "Payouts",             href: "/admin/finance/payouts",         exact: false, icon: "💸" },
      { label: "Reports & Export",    href: "/admin/finance/reports",         exact: false, icon: "📋" },
      { label: "Payment Investigate", href: "/admin/payment-reconcile",       exact: false, icon: "🔍" },
    ],
  },
  {
    key:   "commerce",
    label: "Commerce",
    icon:  "🛍",
    links: [
      { label: "Merchandise",    href: "/admin/merchandise",        exact: false, icon: "👕" },
      { label: "Donations",      href: "/admin/donations",          exact: false, icon: "🤲" },
      { label: "Sponsors",       href: "/admin/sponsors/packages",  exact: false, icon: "🤝" },
    ],
  },
  {
    key:   "reports",
    label: "Reports",
    icon:  "📊",
    links: [
      { label: "Analytics",       href: "/admin/analytics",       exact: false, icon: "📈" },
      { label: "Share Analytics", href: "/admin/share-analytics", exact: false, icon: "↗" },
      { label: "Leaderboard",     href: "/admin/leaderboard",     exact: false, icon: "🏆" },
      { label: "Points",          href: "/admin/points",          exact: false, icon: "⭐" },
      { label: "Memberships",      href: "/admin/membership",       exact: false, icon: "🎖" },
      { label: "Membership Plans", href: "/admin/membership/plans", exact: false, icon: "🎯" },
      { label: "Referrals",        href: "/admin/referrals",        exact: false, icon: "🔗" },
    ],
  },
  {
    key:   "support",
    label: "Support",
    icon:  "🐛",
    links: [
      { label: "Bug Reports", href: "/admin/bug-reports", exact: false, icon: "🐛" },
    ],
  },
  {
    key:   "content",
    label: "Content",
    icon:  "🖼",
    links: [
      { label: "Asset Library", href: "/admin/assets", exact: false, icon: "🖼" },
    ],
  },
  {
    key:   "organizations",
    label: "Organizations",
    icon:  "🏢",
    links: [
      { label: "All Organizations", href: "/admin/orgs", exact: true,  icon: "🏢" },
    ],
  },
  {
    key:   "developer",
    label: "Developer",
    icon:  "🔌",
    links: [
      { label: "Developer Home",  href: "/admin/developer",             exact: true,  icon: "🔌" },
      { label: "API Keys",        href: "/admin/developer/api-keys",    exact: false, icon: "🔑" },
      { label: "Webhooks",        href: "/admin/developer/webhooks",    exact: false, icon: "📡" },
      { label: "Import / Export", href: "/admin/developer/import",      exact: false, icon: "📥" },
      { label: "Automations",     href: "/admin/developer/automations", exact: false, icon: "⚡" },
      { label: "API Docs",        href: "/admin/developer/docs",        exact: false, icon: "📚" },
      { label: "Monitoring",      href: "/admin/developer/monitoring",  exact: false, icon: "📊" },
    ],
  },
  {
    key:   "settings",
    label: "Settings",
    icon:  "⚙️",
    links: [
      { label: "Notifications",    href: "/admin/settings/notifications", exact: false, icon: "🔔" },
      { label: "Platform Settings",href: "/admin/settings",              exact: true,  icon: "⚙️" },
      { label: "Session Reminders",href: "/admin/settings/reminders",   exact: false, icon: "⏰" },
      { label: "Birthday",         href: "/admin/birthday-settings",     exact: false, icon: "🎂" },
    ],
  },
  {
    key:   "system",
    label: "System",
    icon:  "🩺",
    links: [
      { label: "System Health",    href: "/admin/system-health",         exact: false, icon: "🩺" },
    ],
  },
] as const;

// Mobile bottom nav — 5 key destinations
const MOBILE_NAV = [
  { label: "Dashboard",  href: "/admin",                    icon: "⚡",  exact: true  },
  { label: "Events",     href: "/admin/events",             icon: "📅",  exact: true  },
  { label: "People",     href: "/admin/users",              icon: "👥",  exact: false },
  { label: "Community",  href: "/admin/community",          icon: "🤝",  exact: false },
  { label: "Reports",    href: "/admin/finance",            icon: "📊",  exact: false },
] as const;

// ── Global search ──────────────────────────────────────────────────────────────

interface SearchResult {
  type:   "event" | "member" | "registration";
  id:     string;
  label:  string;
  sub?:   string;
  href:   string;
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [q,       setQ]       = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const [evRes, usrRes] = await Promise.all([
          fetch(`/api/admin/events?q=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
          fetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        ]);
        const evs  = (evRes.data  ?? []).map((e: { id: string; title: string; start_date: string }) => ({ type: "event" as const,  id: e.id, label: e.title, sub: e.start_date, href: `/admin/events/${e.id}/manage` }));
        const usrs = (usrRes.users ?? []).map((u: { id: string; first_name: string; last_name: string; email: string }) => ({ type: "member" as const, id: u.id, label: `${u.first_name} ${u.last_name}`, sub: u.email, href: `/admin/users` }));
        setResults([...evs, ...usrs]);
        setCursor(0);
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    if (e.key === "ArrowUp")    { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && results[cursor]) { router.push(results[cursor].href); onClose(); }
  }

  const TYPE_ICONS: Record<string, string> = { event: "📅", member: "👤", registration: "📋" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px 16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize: 16, color: "#555" }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search events, members, registrations…"
            style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit" }}
          />
          {loading && <div className="cs-spin" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #222", borderTopColor: "#e8620a", flexShrink: 0 }} />}
          <kbd style={{ fontSize: 10, color: "#444", padding: "2px 6px", border: "1px solid #333", borderRadius: 4, fontFamily: "inherit" }}>ESC</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {results.map((r, i) => (
              <Link key={r.id + r.type} href={r.href} onClick={onClose}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: i === cursor ? "rgba(232,98,10,0.08)" : "transparent", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICONS[r.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                  {r.sub && <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{r.sub}</div>}
                </div>
                <span style={{ fontSize: 10, color: "#555", flexShrink: 0, padding: "2px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>{r.type}</span>
              </Link>
            ))}
          </div>
        )}

        {q && !loading && results.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#444", fontSize: 13 }}>No results for "{q}"</div>
        )}

        {!q && (
          <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "All Events",    href: "/admin/events",              icon: "📅" },
              { label: "Members",       href: "/admin/users",               icon: "👥" },
              { label: "Registrations", href: "/admin/events/registrations",icon: "📋" },
              { label: "Finance",       href: "/admin/finance",             icon: "💰" },
            ].map(s => (
              <Link key={s.href} href={s.href} onClick={onClose}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none", color: "#888", fontSize: 12, fontWeight: 600 }}>
                <span>{s.icon}</span>{s.label}
              </Link>
            ))}
          </div>
        )}

        <div style={{ padding: "8px 16px 12px", display: "flex", gap: 12, fontSize: 10, color: "#333" }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
}

// ── Main layout ────────────────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [authed,      setAuthed]      = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({});
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  // Persist section collapsed state
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cs_admin_nav_collapsed");
      if (saved) setCollapsed(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function toggleSection(key: string) {
    setCollapsed(c => {
      const next = { ...c, [key]: !c[key] };
      try { localStorage.setItem("cs_admin_nav_collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Auth check
  useEffect(() => {
    if (isLoginPage) { setAuthed(true); return; }
    fetch("/api/admin/auth")
      .then(r => r.ok ? setAuthed(true) : router.push(`/admin/login?redirect=${encodeURIComponent(pathname)}`))
      .catch(() => router.push("/admin/login"));
  }, [isLoginPage, pathname]); // eslint-disable-line

  // Ctrl+K global search
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setSearchOpen(s => !s); }
    if (e.key === "Escape") setSearchOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Loading state
  if (authed === null) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="cs-spin" style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #1a1a1a", borderTopColor: "#e8620a" }} />
      <style>{`@keyframes cs-spin-kf{to{transform:rotate(360deg)}}.cs-spin{animation:cs-spin-kf .7s linear infinite}`}</style>
    </div>
  );

  if (!authed) return null;
  if (isLoginPage) return <>{children}</>;

  const sidebarW = sidebarCollapsed ? 58 : 228;

  return (
    <>
      <style>{`
        @keyframes cs-spin-kf { to { transform: rotate(360deg); } }
        .cs-spin { animation: cs-spin-kf .7s linear infinite; }
        .cs-nav-link { transition: color 0.15s, background 0.15s; }
        .cs-nav-link:hover { color: #e8620a !important; background: rgba(232,98,10,0.07) !important; }
        .cs-section-toggle:hover { color: #888 !important; background: rgba(255,255,255,0.04) !important; }
        .cs-sidebar-overlay { display: none; }
        .cs-mobile-bottom { display: none; }
        @media (max-width: 767px) {
          .cs-sidebar { transform: translateX(-100%); transition: transform 0.22s ease; }
          .cs-sidebar.open { transform: translateX(0); }
          .cs-main { margin-left: 0 !important; }
          .cs-desktop-topbar { display: none !important; }
          .cs-mobile-topbar  { display: flex !important; }
          .cs-sidebar-overlay { display: block; }
          .cs-mobile-bottom { display: flex !important; }
        }
        @media (min-width: 768px) {
          .cs-sidebar { transform: translateX(0) !important; }
          .cs-mobile-topbar { display: none !important; }
          .cs-desktop-topbar { display: flex !important; }
        }
        .cs-main { transition: margin-left 0.22s ease; }
        .cs-sidebar { transition: width 0.22s ease, transform 0.22s ease; }
      `}</style>

      {/* Global search */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="cs-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 49 }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className={`cs-sidebar${sidebarOpen ? " open" : ""}`}
        style={{
          position: "fixed", top: 0, bottom: 0, left: 0,
          width: sidebarW,
          background: "#0a0a0a",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          zIndex: 50, overflowY: "auto", overflowX: "hidden",
        }}
      >
        {/* Logo + collapse toggle */}
        <div style={{ padding: sidebarCollapsed ? "14px 0" : "14px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", flexShrink: 0 }}>
          {!sidebarCollapsed ? (
            <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }} onClick={() => setSidebarOpen(false)}>
              <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Connected Steps</div>
                <div style={{ fontSize: 9, color: "#e8620a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Admin</div>
              </div>
            </Link>
          ) : (
            <Link href="/admin" style={{ textDecoration: "none" }}>
              <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
            </Link>
          )}
          {!sidebarCollapsed && (
            <button onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar"
              style={{ background: "none", border: "none", color: "#333", cursor: "pointer", padding: 4, fontSize: 14, lineHeight: 1, borderRadius: 4 }}>
              ←
            </button>
          )}
        </div>

        {/* Search button */}
        <div style={{ padding: sidebarCollapsed ? "10px 0" : "10px 10px 6px", flexShrink: 0 }}>
          <button onClick={() => setSearchOpen(true)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: sidebarCollapsed ? "8px" : "8px 10px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "#555", fontSize: 12,
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
            }}>
            <span style={{ fontSize: 14 }}>🔍</span>
            {!sidebarCollapsed && (
              <>
                <span style={{ flex: 1, textAlign: "left" }}>Search…</span>
                <kbd style={{ fontSize: 9, color: "#333", padding: "1px 5px", border: "1px solid #333", borderRadius: 3, fontFamily: "inherit" }}>⌘K</kbd>
              </>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, paddingBottom: 8, overflowY: "auto" }}>
          {NAV_GROUPS.map(group => {
            const hasActiveChild = group.links.some(l => isActive(l.href, "exact" in l ? l.exact : false));
            const isOpen = group.label === null || (collapsed[group.key] !== true);

            return (
              <div key={group.key}>
                {/* Section header */}
                {group.label && !sidebarCollapsed && (
                  <button
                    className="cs-section-toggle"
                    onClick={() => toggleSection(group.key)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 4px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ fontSize: 9, color: hasActiveChild ? "#e8620a" : "#444", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                      {group.icon} {group.label}
                    </span>
                    <span style={{ fontSize: 10, color: "#333", transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}>▾</span>
                  </button>
                )}
                {group.label && sidebarCollapsed && (
                  <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "6px 10px" }} />
                )}

                {/* Links */}
                {(isOpen || sidebarCollapsed) && group.links.map(link => {
                  const active = isActive(link.href, "exact" in link ? link.exact : false);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="cs-nav-link"
                      title={sidebarCollapsed ? link.label : undefined}
                      onClick={() => setSidebarOpen(false)}
                      style={{
                        display:      "flex",
                        alignItems:   "center",
                        gap:          sidebarCollapsed ? 0 : 8,
                        justifyContent: sidebarCollapsed ? "center" : "flex-start",
                        padding:      sidebarCollapsed ? "9px 0" : "7px 14px",
                        fontSize:     13,
                        color:        active ? "#e8620a" : "#666",
                        textDecoration: "none",
                        background:   active ? "rgba(232,98,10,0.08)" : "transparent",
                        borderLeft:   sidebarCollapsed ? "none" : `2px solid ${active ? "#e8620a" : "transparent"}`,
                        fontWeight:   active ? 600 : 400,
                        borderRight:  sidebarCollapsed && active ? "2px solid #e8620a" : "none",
                      }}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0, width: sidebarCollapsed ? 28 : "auto", textAlign: "center" }}>
                        {"icon" in link ? link.icon : ""}
                      </span>
                      {!sidebarCollapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div style={{ padding: sidebarCollapsed ? "10px 0" : "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", flexDirection: "column", gap: sidebarCollapsed ? 10 : 6, alignItems: sidebarCollapsed ? "center" : "flex-start" }}>
          {!sidebarCollapsed ? (
            <>
              <Link href="/" target="_blank" rel="noopener" style={{ fontSize: 11, color: "#3a3a3a", textDecoration: "none" }}>↗ View site</Link>
              <Link href="/coach" target="_blank" rel="noopener" style={{ fontSize: 11, color: "#3a3a3a", textDecoration: "none" }}>↗ Coach portal</Link>
              <button onClick={logout} style={{ fontSize: 11, color: "#444", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "inherit" }}>
                Sign out
              </button>
              <button onClick={() => setSidebarCollapsed(false)} style={{ display: "none" }} />
            </>
          ) : (
            <button onClick={() => setSidebarCollapsed(false)} title="Expand sidebar"
              style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14, padding: 4, borderRadius: 4 }}>
              →
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────────── */}
      <div className="cs-main" style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0", marginLeft: sidebarW }}>

        {/* Desktop top bar */}
        <div className="cs-desktop-topbar" style={{ position: "sticky", top: 0, zIndex: 30, height: 52, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "none", alignItems: "center", justifyContent: "flex-end", padding: "0 20px", gap: 12 }}>
          <button onClick={() => setSearchOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "#555", fontSize: 12 }}>
            <span>🔍</span>
            <span>Search</span>
            <kbd style={{ fontSize: 9, color: "#444", padding: "1px 5px", border: "1px solid #333", borderRadius: 3, fontFamily: "inherit", marginLeft: 4 }}>⌘K</kbd>
          </button>
          <Link href="/" target="_blank" rel="noopener"
            style={{ fontSize: 11, color: "#3a3a3a", textDecoration: "none", padding: "6px 10px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6 }}>
            ↗ Site
          </Link>
          <button onClick={logout}
            style={{ fontSize: 11, color: "#444", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", padding: "6px 10px" }}>
            Sign out
          </button>
        </div>

        {/* Mobile top bar */}
        <div className="cs-mobile-topbar" style={{ position: "sticky", top: 0, zIndex: 30, height: 52, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "none", alignItems: "center", justifyContent: "space-between", padding: "0 14px", gap: 10 }}>
          <button onClick={() => setSidebarOpen(o => !o)} aria-label="Open menu"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "#888", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
          </button>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <Image src="/logo.png" alt="" width={22} height={22} style={{ borderRadius: "50%" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Connected Steps</span>
          </Link>
          <button onClick={() => setSearchOpen(true)} aria-label="Search"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#666", fontSize: 18, padding: 4 }}>
            🔍
          </button>
        </div>

        {/* Page content */}
        <div style={{ paddingBottom: 72 }}>
          {children}
        </div>
      </div>

      {/* ── Mobile bottom navigation ──────────────────────────────────────────── */}
      <nav className="cs-mobile-bottom" style={{
        display: "none",
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        background: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "8px 0 env(safe-area-inset-bottom, 8px)",
        justifyContent: "space-around", alignItems: "center",
      }}>
        {MOBILE_NAV.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 12px", textDecoration: "none", minWidth: 44, minHeight: 44, justifyContent: "center" }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, color: active ? "#e8620a" : "#444", letterSpacing: "0.04em" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
