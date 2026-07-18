"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number }

interface Category {
  slug: string; name: string; distance: string; price: number;
  type: "solo" | "duo" | "kid";
  badge: string; color: string; bgGradient: string;
  includes: string[];
  highlights: string[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const EVENT_DATE = new Date("2026-08-17T06:00:00+05:30");
const REG_CLOSE  = new Date("2026-08-10T23:59:59+05:30");

const CATEGORIES: Category[] = [
  {
    slug: "10k-timed", name: "10K Timed Run", distance: "10 KM", price: 799,
    type: "solo", badge: "FLAGSHIP", color: "#e8620a", bgGradient: "linear-gradient(135deg,rgba(232,98,10,0.15),rgba(232,98,10,0.05))",
    includes: ["Chip Timing", "Finisher Medal", "Race BIB", "Dry-fit T-Shirt", "Digital Certificate"],
    highlights: ["Competitive", "Chip Timed", "Medal"],
  },
  {
    slug: "5k-timed", name: "5K Timed Run", distance: "5 KM", price: 599,
    type: "solo", badge: "POPULAR", color: "#f97316", bgGradient: "linear-gradient(135deg,rgba(249,115,22,0.15),rgba(249,115,22,0.05))",
    includes: ["Chip Timing", "Finisher Medal", "Race BIB", "Dry-fit T-Shirt", "Digital Certificate"],
    highlights: ["Competitive", "Chip Timed", "Medal"],
  },
  {
    slug: "5k-fun-run", name: "5K Fun Run", distance: "5 KM", price: 399,
    type: "solo", badge: "BEGINNER", color: "#10b981", bgGradient: "linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))",
    includes: ["Race BIB", "Dry-fit T-Shirt", "Digital Certificate", "Participation Medal"],
    highlights: ["No Pressure", "Community", "Fun"],
  },
  {
    slug: "5k-duo", name: "5K Duo Challenge", distance: "5 KM", price: 999,
    type: "duo", badge: "FOR 2", color: "#6366f1", bgGradient: "linear-gradient(135deg,rgba(99,102,241,0.15),rgba(99,102,241,0.05))",
    includes: ["2x Race BIBs", "2x Dry-fit T-Shirts", "2x Certificates", "Team Recognition"],
    highlights: ["2 Runners", "Team Spirit", "Work Buddy"],
  },
  {
    slug: "1-5k-kid", name: "1.5K Run with Kid", distance: "1.5 KM", price: 299,
    type: "kid", badge: "FAMILY", color: "#ec4899", bgGradient: "linear-gradient(135deg,rgba(236,72,153,0.15),rgba(236,72,153,0.05))",
    includes: ["2x Race BIBs", "2x T-Shirts", "Parent + Child Medals", "Memories for Life"],
    highlights: ["Kids age 10 or under", "Parent + Child", "Fun Track"],
  },
];

const FAQS = [
  { q: "Who can participate in The IT Run Sprint-2?", a: "Any professional working in the IT/tech industry can register. You will need to upload your company ID for verification. Students from tech colleges are also welcome for the Fun Run category." },
  { q: "What documents do I need to upload?", a: "A valid company ID or employee card showing your company name. A selfie with your ID works too. Our team verifies all documents within 24 hours of registration." },
  { q: "Can I run if I am not physically fit?", a: "Absolutely! The 5K Fun Run and 1.5K Run with Kid are designed for all fitness levels. Start walking, start running - the community spirit is what matters." },
  { q: "When will I receive my race BIB?", a: "Race BIBs are collected at designated collection counters on August 14-16, 2026. You can book your preferred time slot from your participant dashboard after payment confirmation." },
  { q: "Is parking available at the venue?", a: "Yes, parking is available at Hitec City. We recommend arriving early. Public transport and ride-sharing options are also convenient to the venue." },
  { q: "What is the refund policy?", a: "Registrations are non-refundable. However, transfers to another participant are allowed until August 8, 2026. Requests must be emailed to info@connectedsteps.in with the new participant's details." },
  { q: "Will there be water stations and medical support?", a: "Yes. Water stations are set up every 2.5 KM on the 10K route and every 2 KM on the 5K route. Qualified medical support including first-aid teams and an ambulance will be on standby." },
  { q: "Can I upgrade my category after registration?", a: "Category upgrades (e.g. 5K to 10K) are allowed until August 5, 2026 by paying the price difference. Email us at info@connectedsteps.in to request an upgrade." },
];

const SCHEDULE = [
  { time: "05:00 AM", event: "Gates Open", desc: "Entry gates open at the venue" },
  { time: "05:30 AM", event: "Report Time", desc: "All participants must report to their designated wave areas" },
  { time: "06:00 AM", event: "10K Flag Off", desc: "10K Timed Run begins - Wave A" },
  { time: "06:05 AM", event: "10K Wave B",   desc: "10K Timed Run - Wave B" },
  { time: "06:30 AM", event: "5K Flag Off",  desc: "5K Timed Run + 5K Fun Run begin" },
  { time: "06:35 AM", event: "Duo & Kid Run", desc: "5K Duo Challenge + 1.5K Run with Kid" },
  { time: "08:00 AM", event: "10K Cutoff",   desc: "10K route closes" },
  { time: "08:30 AM", event: "Award Ceremony", desc: "Top finishers award ceremony + group photos" },
  { time: "09:30 AM", event: "Event Close",  desc: "Official event wrap-up" },
];

const WHY_ITEMS = [
  { icon: "laptop", title: "Network with Tech Peers", desc: "Connect with engineers, developers and tech leaders from 200+ companies" },
  { icon: "heart", title: "Build a Healthy Habit", desc: "Running is the most powerful productivity tool. No meetings, pure clarity" },
  { icon: "trophy", title: "Company Leaderboard", desc: "See which company sends the most runners - bragging rights included" },
  { icon: "medal", title: "Finisher Recognition", desc: "Timed categories get chip-timed results with digital certificates and medals" },
  { icon: "users", title: "Inclusive for All Levels", desc: "From couch to finish line - every runner is celebrated equally" },
  { icon: "camera", title: "Race Photography", desc: "Professional photographers capture your finish-line moment" },
];

// ── Countdown timer ────────────────────────────────────────────────────────────

function useCountdown(target: Date): TimeLeft {
  const calc = (): TimeLeft => {
    const diff = Math.max(0, target.getTime() - Date.now());
    return {
      days:    Math.floor(diff / 86400000),
      hours:   Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000)  / 60000),
      seconds: Math.floor((diff % 60000)    / 1000),
    };
  };
  const [t, setT] = useState<TimeLeft>(calc);
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  });
  return t;
}

// ── Icon component (inline SVGs) ──────────────────────────────────────────────

function Icon({ name, size = 20, color = "currentColor" }: { name: string; size?: number; color?: string }) {
  const icons: Record<string, string> = {
    check:   "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    chevron: "M19 9l-7 7-7-7",
    clock:   "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    map:     "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z",
    laptop:  "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    heart:   "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
    trophy:  "M8 21h8m-4-4v4m0 0H8m4 0h4M7 3h10l1 7H6L7 3zM9 10v1a3 3 0 006 0v-1",
    medal:   "M9 7h6m0 10v-3m-3 3h.01M9 17v-3m-3 0h12M7 7V3m10 4V3M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z",
    users:   "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    camera:  "M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z",
    mail:    "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    phone:   "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
    arrow:   "M13 7l5 5m0 0l-5 5m5-5H6",
    star:    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
    run:     "M13 5a2 2 0 100-4 2 2 0 000 4zm-5.4 9.2l1.5 1.5L7 18h4.5l1.3-5H18v-2h-5.7l-1.4-2.8A2 2 0 009.1 7H6v2h3.1l2.4 4.8-2.5 2.5z",
  };
  return (
    <svg width={size} height={size} fill="none" stroke={color} strokeWidth={1.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {name === "users" ? (
        <>
          <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
          <path d="M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </>
      ) : name === "camera" ? (
        <>
          <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </>
      ) : (
        <path d={icons[name] ?? icons.star} />
      )}
    </svg>
  );
}

// ── CountBox ──────────────────────────────────────────────────────────────────

function CountBox({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "clamp(28px, 5vw, 48px)",
        fontWeight: 900,
        fontVariantNumeric: "tabular-nums",
        color: "#fff",
        lineHeight: 1,
        minWidth: 64,
        fontFamily: "'SF Pro Display', system-ui, sans-serif",
      }}>
        {String(value).padStart(2, "0")}
      </div>
      <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 6 }}>{label}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:    { background: "#080808", color: "#fff", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowX: "hidden" as const },
  nav:     { position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(8,8,8,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", height: 64, display: "flex", alignItems: "center", padding: "0 clamp(1rem,4vw,3rem)", justifyContent: "space-between" },
  section: { padding: "clamp(4rem,8vw,7rem) clamp(1rem,4vw,3rem)", maxWidth: 1200, margin: "0 auto" } as React.CSSProperties,
  tag:     { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.4)", borderRadius: 100, padding: "5px 14px", fontSize: 11, color: "#e8620a", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const },
  card:    { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "24px" } as React.CSSProperties,
  h2:      { fontSize: "clamp(28px,4vw,44px)", fontWeight: 900, color: "#fff", lineHeight: 1.1, margin: "0 0 12px" } as React.CSSProperties,
  sub:     { fontSize: 16, color: "#888", lineHeight: 1.7, maxWidth: 560 } as React.CSSProperties,
  cta:     { display: "inline-flex", alignItems: "center", gap: 8, background: "#e8620a", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 28px", borderRadius: 10, border: "none", cursor: "pointer", textDecoration: "none", transition: "all 0.2s", letterSpacing: "0.01em" } as React.CSSProperties,
  ghost:   { display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", color: "#fff", fontWeight: 600, fontSize: 15, padding: "14px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", textDecoration: "none", transition: "all 0.2s" } as React.CSSProperties,
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ItRunLandingPage() {
  const countdown     = useCountdown(EVENT_DATE);
  const regCountdown  = useCountdown(REG_CLOSE);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [navScrolled, setNavScrolled] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const regClosed = Date.now() > REG_CLOSE.getTime();

  return (
    <div style={S.page}>

      {/* ── Navigation ── */}
      <nav style={{ ...S.nav, background: navScrolled ? "rgba(8,8,8,0.97)" : "transparent", borderBottom: navScrolled ? "1px solid rgba(255,255,255,0.06)" : "none", transition: "all 0.3s" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} style={{ borderRadius: "50%" }} />
          <span style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>Connected Steps</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="#categories" style={{ color: "#888", fontSize: 13, textDecoration: "none", padding: "0 8px", display: "none" }}>Categories</a>
          <a href="#schedule"   style={{ color: "#888", fontSize: 13, textDecoration: "none", padding: "0 12px" }}>Schedule</a>
          <a href="#faq"        style={{ color: "#888", fontSize: 13, textDecoration: "none", padding: "0 12px" }}>FAQ</a>
          <Link href="/it-run/register" style={{ ...S.cta, padding: "10px 20px", fontSize: 13 }}>Register</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div ref={heroRef} style={{ minHeight: "100vh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "clamp(5rem,10vw,8rem) clamp(1rem,4vw,3rem) 4rem", textAlign: "center", overflow: "hidden" }}>
        {/* Background decoration */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(232,98,10,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "40%", left: "5%",  width: 300, height: 300, background: "rgba(232,98,10,0.04)", borderRadius: "50%", filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "30%", right: "5%", width: 200, height: 200, background: "rgba(99,102,241,0.06)", borderRadius: "50%", filter: "blur(60px)", pointerEvents: "none" }} />

        {/* Content */}
        <div style={{ position: "relative", maxWidth: 860, width: "100%" }}>
          <div style={{ ...S.tag, marginBottom: 24, fontSize: 10 }}>
            <span>IT</span>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#e8620a" }} />
            <span>Exclusive for IT Professionals</span>
          </div>

          <h1 style={{
            fontSize: "clamp(52px,10vw,100px)", fontWeight: 900,
            lineHeight: 0.9, margin: "0 0 8px",
            background: "linear-gradient(180deg,#fff 40%,rgba(255,255,255,0.7))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-0.03em",
          }}>
            THE IT RUN
          </h1>
          <h2 style={{
            fontSize: "clamp(28px,6vw,60px)", fontWeight: 900,
            color: "#e8620a", margin: "0 0 24px",
            letterSpacing: "-0.02em", lineHeight: 1,
          }}>
            SPRINT-2
          </h2>

          <p style={{ fontSize: "clamp(14px,2vw,18px)", color: "#999", marginBottom: 32, lineHeight: 1.6 }}>
            Your Code Compiles. Now Run It.
            <br />
            <span style={{ color: "#666", fontSize: 14 }}>August 17, 2026 &nbsp;|&nbsp; Hitec City, Hyderabad</span>
          </p>

          {/* Countdown */}
          <div style={{ display: "flex", gap: "clamp(8px,2vw,20px)", justifyContent: "center", marginBottom: 40, flexWrap: "wrap" }}>
            <CountBox value={countdown.days}    label="Days"    />
            <div style={{ display: "flex", alignItems: "center", paddingBottom: 20, fontSize: 28, color: "#444", fontWeight: 900 }}>:</div>
            <CountBox value={countdown.hours}   label="Hours"   />
            <div style={{ display: "flex", alignItems: "center", paddingBottom: 20, fontSize: 28, color: "#444", fontWeight: 900 }}>:</div>
            <CountBox value={countdown.minutes} label="Minutes" />
            <div style={{ display: "flex", alignItems: "center", paddingBottom: 20, fontSize: 28, color: "#444", fontWeight: 900 }}>:</div>
            <CountBox value={countdown.seconds} label="Seconds" />
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {regClosed ? (
              <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "14px 28px", color: "#888", fontSize: 15 }}>
                Registration Closed
              </div>
            ) : (
              <Link href="/it-run/register" style={S.cta}>
                Register Now
                <Icon name="arrow" size={16} />
              </Link>
            )}
            <a href="#categories" style={S.ghost}>View Categories</a>
          </div>

          {/* Quick stats */}
          <div style={{ display: "flex", gap: "clamp(24px,4vw,48px)", justifyContent: "center", marginTop: 48, flexWrap: "wrap" }}>
            {[["5", "Race Categories"], ["10 KM", "Longest Race"], ["Aug 10", "Reg Closes"]].map(([v, l]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "clamp(20px,3vw,28px)", fontWeight: 900, color: "#e8620a" }}>{v}</div>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", animation: "bounce 2s infinite" }}>
          <div style={{ width: 24, height: 40, border: "2px solid rgba(255,255,255,0.15)", borderRadius: 12, display: "flex", justifyContent: "center", paddingTop: 6 }}>
            <div style={{ width: 3, height: 8, background: "#e8620a", borderRadius: 2, animation: "scrollDown 1.5s ease infinite" }} />
          </div>
        </div>
      </div>

      {/* ── Reg closes countdown ── */}
      {!regClosed && (
        <div style={{ background: "rgba(232,98,10,0.1)", borderTop: "1px solid rgba(232,98,10,0.2)", borderBottom: "1px solid rgba(232,98,10,0.2)", padding: "16px clamp(1rem,4vw,3rem)", textAlign: "center" }}>
          <span style={{ color: "#e8620a", fontWeight: 700, fontSize: 13 }}>
            Registration closes in {regCountdown.days}d {regCountdown.hours}h {regCountdown.minutes}m
            &nbsp;&nbsp;|&nbsp;&nbsp;
          </span>
          <Link href="/it-run/register" style={{ color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "underline" }}>
            Secure your spot now
          </Link>
        </div>
      )}

      {/* ── About the Event ── */}
      <section style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 48, alignItems: "center" }}>
          <div>
            <div style={S.tag}>About</div>
            <h2 style={{ ...S.h2, marginTop: 16 }}>India's Premier Tech Community Run</h2>
            <p style={{ ...S.sub, marginBottom: 20 }}>
              The IT Run Sprint-2 is Hyderabad's most exciting running event exclusively for the technology community. Born from the belief that the best engineers maintain both mental and physical fitness, this event brings together coders, designers, product managers, and tech leaders for a morning of running, networking, and celebration.
            </p>
            <p style={S.sub}>
              Following the incredible success of Sprint-1 with 800+ participants from 120+ companies, Sprint-2 is bigger, better and bolder. Join the movement - run for your health, run for your career, run for your community.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["800+", "Participants in Sprint-1"], ["120+", "Companies Represented"], ["5", "Race Categories"], ["3", "Award Tiers"]].map(([n, l]) => (
              <div key={l} style={{ ...S.card, textAlign: "center" }}>
                <div style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 900, color: "#e8620a" }}>{n}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4, lineHeight: 1.4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Race Categories ── */}
      <section id="categories" style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={S.tag}>Race Categories</div>
          <h2 style={{ ...S.h2, marginTop: 16 }}>Choose Your Challenge</h2>
          <p style={S.sub}>Five carefully designed categories to match every fitness level. From hardcore 10K runners to first-timers and families.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {CATEGORIES.map((cat) => (
            <div
              key={cat.slug}
              style={{
                background: cat.bgGradient,
                border: `1px solid ${cat.color}30`,
                borderRadius: 20,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                transition: "transform 0.2s, box-shadow 0.2s",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 20px 40px ${cat.color}20`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
            >
              {/* Badge */}
              <span style={{ position: "absolute", top: 16, right: 16, background: cat.color, color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.12em" }}>
                {cat.badge}
              </span>

              {/* Distance */}
              <div style={{ fontSize: "clamp(36px,5vw,52px)", fontWeight: 900, color: cat.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {cat.distance}
              </div>

              {/* Name + Type */}
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{cat.name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {cat.highlights.map(h => (
                    <span key={h} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#ccc" }}>{h}</span>
                  ))}
                </div>
              </div>

              {/* Includes */}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {cat.includes.map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ccc" }}>
                    <div style={{ color: cat.color, flexShrink: 0 }}>
                      <Icon name="check" size={14} color={cat.color} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              {/* Price + CTA */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ fontSize: "clamp(22px,3vw,28px)", fontWeight: 900, color: cat.color }}>
                    Rs. {cat.price.toLocaleString("en-IN")}
                  </div>
                  {cat.type === "duo" && <div style={{ fontSize: 11, color: "#666" }}>for 2 runners</div>}
                  {cat.type === "kid"  && <div style={{ fontSize: 11, color: "#666" }}>parent + child</div>}
                </div>
                {regClosed ? (
                  <span style={{ fontSize: 12, color: "#666" }}>Closed</span>
                ) : (
                  <Link href={`/it-run/register?category=${cat.slug}`} style={{ background: cat.color, color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 8, textDecoration: "none", transition: "opacity 0.2s" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                    Register
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why Participate ── */}
      <section style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={S.tag}>Why Join</div>
          <h2 style={{ ...S.h2, marginTop: 16 }}>Why IT Professionals Run</h2>
          <p style={S.sub}>Because the best code is written by the healthiest minds.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
          {WHY_ITEMS.map(item => (
            <div key={item.title} style={{ ...S.card, transition: "transform 0.2s, border-color 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.3)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)"; }}>
              <div style={{ width: 40, height: 40, background: "rgba(232,98,10,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Icon name={item.icon} size={20} color="#e8620a" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Race Details ── */}
      <section style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 32 }}>
          {/* Venue */}
          <div style={S.card}>
            <div style={{ fontSize: 11, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12, fontWeight: 700 }}>Venue</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Hitec City Marathon Point</div>
            <div style={{ fontSize: 14, color: "#888", lineHeight: 1.7 }}>
              Hitech City Road, HITEC City<br />Hyderabad, Telangana 500081
            </div>
            <a href="https://maps.google.com/?q=HITEC+City+Hyderabad" target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, color: "#e8620a", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              <Icon name="map" size={14} color="#e8620a" />
              View on Maps
            </a>
          </div>
          {/* Timing */}
          <div style={S.card}>
            <div style={{ fontSize: 11, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12, fontWeight: 700 }}>Event Timing</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Gates Open",     "05:00 AM"], ["Report Time",    "05:30 AM"], ["10K Flag Off",   "06:00 AM"], ["5K Flag Off",    "06:30 AM"], ["Award Ceremony", "08:30 AM"]].map(([label, time]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e8620a" }}>{time}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Kit */}
          <div style={S.card}>
            <div style={{ fontSize: 11, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12, fontWeight: 700 }}>Race Kit</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Dry-fit T-Shirt",    "All categories"],  ["Race BIB",           "Personalized"], ["Finisher Medal",    "10K + 5K Timed"], ["Timing Chip",       "10K + 5K Timed"], ["Digital Certificate","All categories"]].map(([item, note]) => (
                <div key={item} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 13, color: "#ccc" }}>{item}</span>
                  <span style={{ fontSize: 11, color: "#666" }}>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Schedule ── */}
      <section id="schedule" style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={S.tag}>Event Day</div>
          <h2 style={{ ...S.h2, marginTop: 16 }}>Race Day Schedule</h2>
          <p style={S.sub}>August 17, 2026 - Hitec City, Hyderabad</p>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: "clamp(48px,8vw,60px)", top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {SCHEDULE.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 20, paddingLeft: "clamp(96px,16vw,120px)", paddingBottom: 24, position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: "clamp(40px,7vw,52px)",
                  top: 2, width: 18, height: 18,
                  background: i === 0 ? "#e8620a" : "rgba(255,255,255,0.08)",
                  border: `2px solid ${i === 0 ? "#e8620a" : "rgba(255,255,255,0.15)"}`,
                  borderRadius: "50%",
                  zIndex: 1,
                }} />
                <div style={{ position: "absolute", left: 0, top: 0, width: "clamp(80px,12vw,100px)", textAlign: "right" }}>
                  <span style={{ fontSize: 12, color: "#e8620a", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{item.time}</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{item.event}</div>
                  <div style={{ fontSize: 13, color: "#888" }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={S.tag}>Sprint-1 Voices</div>
          <h2 style={{ ...S.h2, marginTop: 16 }}>What Runners Said</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {[
            { name: "Priya S.", role: "Senior Engineer, TCS", text: "Best 5K of my life! The energy at the start line was incredible. Every runner was a techie - the conversations before the race were as good as the run itself.", stars: 5 },
            { name: "Rahul M.", role: "Product Manager, Infosys", text: "Ran with my team of 4. The organization was world-class. BIB collection was smooth, the route was perfect, and the finisher medal is on my desk right now.", stars: 5 },
            { name: "Aisha K.", role: "Data Scientist, Wipro", text: "First time running with my daughter in the Kid's run. She loved every second. The finish-line photos are absolutely priceless. Already registered for Sprint-2!", stars: 5 },
          ].map((t) => (
            <div key={t.name} style={S.card}>
              <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                {Array.from({ length: t.stars }).map((_, i) => <Icon key={i} name="star" size={14} color="#f59e0b" />)}
              </div>
              <p style={{ fontSize: 14, color: "#ccc", lineHeight: 1.7, margin: "0 0 16px", fontStyle: "italic" }}>"{t.text}"</p>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQs ── */}
      <section id="faq" style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={S.tag}>FAQs</div>
          <h2 style={{ ...S.h2, marginTop: 16 }}>Frequently Asked Questions</h2>
        </div>
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: "100%", background: openFaq === i ? "rgba(232,98,10,0.06)" : "rgba(255,255,255,0.02)", border: "none", color: "#fff", padding: "16px 20px", textAlign: "left", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontFamily: "inherit" }}>
                <span>{faq.q}</span>
                <span style={{ flexShrink: 0, color: "#e8620a", transform: openFaq === i ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>
                  <Icon name="chevron" size={18} color="#e8620a" />
                </span>
              </button>
              {openFaq === i && (
                <div style={{ padding: "0 20px 16px", fontSize: 14, color: "#999", lineHeight: 1.7 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Refund Policy ── */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "clamp(2rem,4vw,3rem) clamp(1rem,4vw,3rem)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Refund Policy</div>
              <div style={{ fontSize: 14, color: "#888", lineHeight: 1.7 }}>Registrations are non-refundable. Transfers to another participant are allowed until August 8, 2026. Email info@connectedsteps.in to request a transfer.</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Event Cancellation</div>
              <div style={{ fontSize: 14, color: "#888", lineHeight: 1.7 }}>In case of event cancellation due to unforeseen circumstances, full refunds will be processed within 7-10 business days to the original payment method.</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Category Transfer</div>
              <div style={{ fontSize: 14, color: "#888", lineHeight: 1.7 }}>Category upgrades are allowed until August 5, 2026 by paying the price difference. No downgrades permitted.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section style={{ ...S.section, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={S.tag}>Contact</div>
          <h2 style={{ ...S.h2, marginTop: 16 }}>Get in Touch</h2>
          <p style={S.sub}>Have questions? We are here to help every step of the way.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, maxWidth: 700, margin: "0 auto" }}>
          {[
            { icon: "mail",  label: "Email", value: "info@connectedsteps.in", href: "mailto:info@connectedsteps.in" },
            { icon: "phone", label: "Phone", value: "+91 97036 20570",         href: "tel:+919703620570" },
          ].map(c => (
            <a key={c.label} href={c.href} style={{ ...S.card, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", transition: "border-color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.3)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}>
              <div style={{ width: 40, height: 40, background: "rgba(232,98,10,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={c.icon} size={18} color="#e8620a" />
              </div>
              <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>{c.label}</div>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{c.value}</div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Sticky CTA (mobile) ── */}
      {!regClosed && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99, padding: "12px 16px", background: "rgba(8,8,8,0.96)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)", display: "none" }} className="mobile-sticky-cta">
          <Link href="/it-run/register" style={{ ...S.cta, width: "100%", justifyContent: "center", borderRadius: 12, padding: "15px" }}>
            Register Now - From Rs. 299
          </Link>
        </div>
      )}

      {/* ── Footer ── */}
      <footer style={{ padding: "clamp(2rem,4vw,3rem) clamp(1rem,4vw,3rem)", borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
            <Image src="/logo.png" alt="Connected Steps" width={28} height={28} style={{ borderRadius: "50%" }} />
            <span style={{ fontWeight: 700, color: "#fff", fontSize: 16 }}>Connected Steps</span>
          </div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
            SVR Homes, 3rd Floor, Miyapur, Hyderabad, Telangana 500049
          </div>
          <div style={{ fontSize: 12, color: "#444" }}>
            &copy; 2026 Connected Steps. All rights reserved.
            &nbsp;|&nbsp;
            <Link href="/privacy" style={{ color: "#555", textDecoration: "none" }}>Privacy</Link>
            &nbsp;|&nbsp;
            <Link href="/terms"   style={{ color: "#555", textDecoration: "none" }}>Terms</Link>
          </div>
        </div>
      </footer>

      {/* ── CSS Keyframes ── */}
      <style>{`
        @keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-8px)} }
        @keyframes scrollDown { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(10px)} }
        @media (max-width:640px) { .mobile-sticky-cta { display:block !important; } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
