"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";

type ModalType = "followers" | "following" | null;

interface User {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

interface Points {
  week_points:  number;
  total_points: number;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

export default function Dashboard() {
  const router = useRouter();
  const [user,          setUser]          = useState<User | null>(null);
  const [followers,     setFollowers]     = useState<string[]>([]);
  const [following,     setFollowing]     = useState<string[]>([]);
  const [modal,         setModal]         = useState<ModalType>(null);
  const [mobileMenuOpen,setMobileMenuOpen]= useState(false);
  const [points,        setPoints]        = useState<Points | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    // Load followers/following
    Promise.all([
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=followers`).then((r) => r.json()),
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`).then((r) => r.json()),
    ]).then(([fwers, fwing]) => {
      if (fwers.users) setFollowers(fwers.users);
      if (fwing.users) setFollowing(fwing.users);
    });

    // Load leaderboard points for this user
    fetch(`/api/leaderboard/user?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => { if (d.week_points !== undefined) setPoints(d); })
      .catch(() => {});
  }, [router]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* ── Navbar ── */}
      <header className="cs-app-nav">
        <div className="cs-app-nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
          </Link>

          <nav className="cs-app-nav-links">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Dashboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="cs-app-nav-user">
            <UserMenu user={user as MenuUser} onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} />
            <button className="cs-mobile-nav-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="cs-mobile-menu">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
            ].map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ fontSize: "0.95rem", color: item.label === "Dashboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* ── Body ── */}
      <div className="cs-dashboard-body">

        {/* ── Left sidebar ── */}
        <aside>
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.75rem", textAlign: "center" }}>
            {user.photo ? (
              <img src={user.photo} alt={fullName} style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--cs-orange)", margin: "0 auto 1rem" }} />
            ) : (
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 700, color: "var(--cs-white)", margin: "0 auto 1rem" }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <div className="font-display" style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.25rem" }}>{fullName}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
              {goalLabel[user.goal] ?? user.goal}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {[
                { num: String(following.length), label: "Following", type: "following" as ModalType },
                { num: String(followers.length), label: "Followers", type: "followers" as ModalType },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setModal(s.type)}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.num}</div>
                  <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem", textAlign: "left" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px" }}>Training location</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>📍 {user.location || "—"}</div>
            </div>
          </div>

          {/* Points card */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1.25rem", marginTop: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Your Points</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {[
                { label: "This week", value: points?.week_points  ?? "—" },
                { label: "All time",  value: points?.total_points ?? "—" },
              ].map((s) => (
                <div key={s.label} style={{ background: "rgba(232,98,10,0.07)", borderRadius: "6px", padding: "0.75rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.value}</div>
                  <div style={{ fontSize: "10px", color: "var(--cs-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "0.75rem", lineHeight: 1.5 }}>
              Points are awarded by your coach for attendance and challenges.
            </p>
          </div>
        </aside>

        {/* ── Main feed ── */}
        <main>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Training Sessions
          </div>

          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏃</div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>
              Your session history will appear here
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", maxWidth: "380px", margin: "0 auto 1.5rem", lineHeight: 1.7 }}>
              Attend a Connected Steps training session and your coach will log your attendance. Your activity, points, and progress will show up here automatically.
            </p>
            <Link href="/weekend-run" style={{ display: "inline-block", padding: "10px 24px", background: "var(--cs-orange)", color: "#fff", borderRadius: "4px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>
              Register for the next run →
            </Link>
          </div>
        </main>

        {/* ── Right sidebar ── */}
        <aside>
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Quick Links</div>
            {[
              { label: "View Leaderboard",     href: "/leaderboard",   icon: "🏆" },
              { label: "Register for Next Run", href: "/weekend-run",   icon: "🏃" },
              { label: "Community",             href: "/community",     icon: "👥" },
              { label: "Achievements",          href: "/achievements",  icon: "🎖️" },
            ].map((l) => (
              <Link key={l.label} href={l.href} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)", textDecoration: "none" }}>
                <span style={{ fontSize: "1rem" }}>{l.icon}</span>
                <span style={{ fontSize: "0.82rem", color: "var(--cs-muted)" }}>{l.label}</span>
              </Link>
            ))}
          </div>

          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Community</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cs-off-white)", lineHeight: 1.6 }}>
              You're part of the Connected Steps community. Join a group run near {user.location || "you"}!
            </div>
            <Link href="/community" style={{ display: "block", marginTop: "1rem", width: "100%", padding: "10px", background: "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>
              Explore Community
            </Link>
          </div>
        </aside>
      </div>

      {/* Followers / Following modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "1.5rem", width: "360px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)", textTransform: "capitalize" }}>{modal}</div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "var(--cs-muted)", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
            </div>
            {(modal === "followers" ? followers : following).length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--cs-muted)", fontSize: "0.875rem" }}>
                {modal === "followers" ? "No followers yet." : "Not following anyone yet."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(modal === "followers" ? followers : following).map((email) => (
                  <div key={email} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>
                      {email[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
