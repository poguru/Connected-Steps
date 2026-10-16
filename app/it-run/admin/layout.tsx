"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ACCENT = "#e8620a";

// Menu sections, in the order staff see them. Each item lists the roles that may open its page.
const SECTIONS = ["Overview", "Event setup", "Registrations", "Verification & BIB", "Race day", "Payments & refunds", "Communication", "Reports & admin"];

const NAV_ITEMS: Array<{ href: string; label: string; icon: string; section: string; roles: string[] }> = [
  // Overview
  { section: "Overview", href: "/it-run/admin", label: "Dashboard", icon: "&#9632;", roles: ["super_admin", "event_admin", "support_desk"] },

  // Event setup
  { section: "Event setup", href: "/it-run/admin/settings", label: "Event Settings", icon: "&#9881;", roles: ["super_admin", "event_admin"] },
  { section: "Event setup", href: "/it-run/admin/categories", label: "Categories & Prices", icon: "&#9776;", roles: ["super_admin", "event_admin"] },
  { section: "Event setup", href: "/it-run/admin/coupons", label: "Coupons", icon: "&#127315;", roles: ["super_admin", "event_admin"] },
  { section: "Event setup", href: "/it-run/admin/early-bird", label: "Early Bird Offers", icon: "&#127919;", roles: ["super_admin", "event_admin"] },

  // Registrations
  { section: "Registrations", href: "/it-run/admin/registrations", label: "Registrations", icon: "&#9679;", roles: ["super_admin", "event_admin", "support_desk", "verification_team", "bib_collection", "checkin_team"] },
  { section: "Registrations", href: "/it-run/admin/participants", label: "Participants", icon: "&#128100;", roles: ["super_admin", "event_admin", "support_desk", "verification_team"] },
  { section: "Registrations", href: "/it-run/admin/user-linking", label: "Link Accounts", icon: "&#128279;", roles: ["super_admin", "event_admin"] },

  // Verification & BIB
  { section: "Verification & BIB", href: "/it-run/admin/verification", label: "Company ID Checks", icon: "&#9745;", roles: ["super_admin", "event_admin", "verification_team"] },
  { section: "Verification & BIB", href: "/it-run/admin/bibs", label: "BIB Numbers", icon: "&#127987;", roles: ["super_admin", "event_admin", "bib_collection"] },
  { section: "Verification & BIB", href: "/it-run/admin/bib-counters", label: "BIB Counters", icon: "&#128205;", roles: ["super_admin", "event_admin"] },
  { section: "Verification & BIB", href: "/it-run/admin/bib-slots", label: "Collection Slots", icon: "&#128197;", roles: ["super_admin", "event_admin"] },
  { section: "Verification & BIB", href: "/it-run/admin/tshirt", label: "T-Shirt Reports", icon: "&#128085;", roles: ["super_admin", "event_admin", "support_desk"] },

  // Race day
  { section: "Race day", href: "/it-run/admin/bib-collection", label: "BIB Collection", icon: "&#127915;", roles: ["super_admin", "event_admin"] },
  { section: "Race day", href: "/it-run/admin/checkins", label: "Check-in", icon: "&#10003;", roles: ["super_admin", "event_admin", "checkin_team"] },
  { section: "Race day", href: "/it-run/admin/staff-ops", label: "Staff Operations", icon: "&#128119;", roles: ["super_admin", "event_admin"] },
  { section: "Race day", href: "/it-run/admin/operations-dashboard", label: "Live Operations", icon: "&#128200;", roles: ["super_admin", "event_admin"] },

  // Payments & refunds
  { section: "Payments & refunds", href: "/it-run/admin/payments", label: "Payments", icon: "&#128179;", roles: ["super_admin", "event_admin", "support_desk"] },
  { section: "Payments & refunds", href: "/it-run/admin/refund-requests", label: "Refund Requests", icon: "&#128203;", roles: ["super_admin", "event_admin"] },
  { section: "Payments & refunds", href: "/it-run/admin/refund-reconciliation", label: "Refund Status", icon: "&#128190;", roles: ["super_admin", "event_admin"] },

  // Communication
  { section: "Communication", href: "/it-run/admin/emails", label: "Event Emails", icon: "&#9993;", roles: ["super_admin", "event_admin"] },
  { section: "Communication", href: "/it-run/admin/notifications", label: "Confirmation Emails", icon: "&#128232;", roles: ["super_admin", "event_admin"] },

  // Reports & admin
  { section: "Reports & admin", href: "/it-run/admin/reports", label: "Reports", icon: "&#128202;", roles: ["super_admin", "event_admin"] },
  { section: "Reports & admin", href: "/it-run/admin/feedback", label: "Feedback", icon: "&#9733;", roles: ["super_admin", "event_admin"] },
  { section: "Reports & admin", href: "/it-run/admin/staff", label: "Staff Accounts", icon: "&#128100;", roles: ["super_admin", "event_admin"] },
  { section: "Reports & admin", href: "/it-run/admin/audit-logs", label: "Audit Log", icon: "&#128196;", roles: ["super_admin", "event_admin"] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [role,     setRole]     = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [sideOpen, setSideOpen] = useState(false);

  // Read portal session info from cookie (client-side check for UI only)
  useEffect(() => {
    fetch("/api/it-run/portal/auth", { method: "GET" })
      .then(r => r.json())
      .then(d => { setRole(d.role ?? ""); setUserName(d.name ?? ""); })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/it-run/portal/auth", { method: "DELETE" });
    router.push("/it-run/admin/login");
  }

  const visibleItems = NAV_ITEMS.filter(item => !role || item.roles.includes(role));

  const isActive = (href: string) =>
    href === "/it-run/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", overflowX: "hidden" }}>

      {/* Sidebar overlay (mobile) */}
      {sideOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 98 }}
          onClick={() => setSideOpen(false)} />
      )}

      {/* Sidebar */}
      <aside id="itr-sidebar" style={{
        position:   "fixed", top: 0, left: sideOpen ? 0 : "-260px",
        bottom: 0, width: 240,
        background: "#0d0d0d", borderRight: "1px solid rgba(255,255,255,0.06)",
        display:    "flex", flexDirection: "column",
        zIndex:     99, transition: "left 0.25s ease",
        overflowY:  "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>IT Run Sprint-2</div>
          <div style={{ fontSize: 11, color: ACCENT }}>Event Admin Portal</div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {SECTIONS.map(section => {
            const items = visibleItems.filter(i => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section}>
                <div style={{ padding: "14px 20px 4px", fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.12em" }}>{section}</div>
                {items.map(item => (
            <Link key={item.href} href={item.href}
              onClick={() => setSideOpen(false)}
              style={{
                display:         "flex", alignItems: "center", gap: 10,
                padding:         "10px 20px",
                fontSize:        13, fontWeight: isActive(item.href) ? 700 : 400,
                color:           isActive(item.href) ? "#fff" : "#888",
                textDecoration:  "none",
                background:      isActive(item.href) ? "rgba(232,98,10,0.1)" : "transparent",
                borderRight:     isActive(item.href) ? `3px solid ${ACCENT}` : "3px solid transparent",
                transition:      "all 0.15s",
              }}
              onMouseEnter={e => { if (!isActive(item.href)) (e.currentTarget as HTMLAnchorElement).style.color = "#ccc"; }}
              onMouseLeave={e => { if (!isActive(item.href)) (e.currentTarget as HTMLAnchorElement).style.color = "#888"; }}>
              <span dangerouslySetInnerHTML={{ __html: item.icon }} style={{ width: 18, textAlign: "center" }} />
              {item.label}
            </Link>
                ))}
              </div>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {userName && <div style={{ fontSize: 12, color: "#ccc", marginBottom: 2 }}>{userName}</div>}
          {role && <div style={{ fontSize: 10, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>{role.replace(/_/g, " ")}</div>}
          <button onClick={logout}
            style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div id="itr-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <header style={{ height: 56, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", padding: "0 20px", gap: 12, position: "sticky", top: 0, zIndex: 97, backdropFilter: "blur(20px)" }}>
          <button onClick={() => setSideOpen(true)}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 16 }}>
            &#9776;
          </button>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#fff" }}>
            {visibleItems.find(i => isActive(i.href))?.label ?? "Admin Portal"}
          </div>
          <Link href="/it-run" target="_blank" style={{ fontSize: 12, color: "#888", textDecoration: "none" }}>
            View Event
          </Link>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: "clamp(1rem,3vw,2rem)" }}>
          {children}
        </main>
      </div>

      <style>{`
        @media(min-width:900px){
          #itr-sidebar { left: 0 !important; }
          #itr-main    { margin-left: 240px; }
        }
      `}</style>
    </div>
  );
}
