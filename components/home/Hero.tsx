"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Hero() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("cs_user")) setLoggedIn(true);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center noise" style={{ background: "var(--cs-black)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,98,10,0.1) 0%, transparent 70%)" }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(var(--cs-white) 1px, transparent 1px), linear-gradient(90deg, var(--cs-white) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }} />

      <div className="container relative z-10" style={{ paddingTop: "8rem", paddingBottom: "5rem" }}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="section-label animate-fade-up">Connected Steps</div>
            <h1 className="font-display animate-fade-up-1 mb-6"
              style={{ fontSize: "clamp(2rem, 7vw, 5.5rem)", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1.1 }}>
              Every step,{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>a plan</em>
              <br />behind it.
            </h1>
            <p className="text-base leading-relaxed mb-10 max-w-md animate-fade-up-2"
              style={{ color: "var(--cs-muted)", fontSize: "1.05rem" }}>
              Connected Steps pairs you with elite coaches and a training community that keeps you
              accountable — from your first kilometre to your finish-line moment.
            </p>
            <div className="animate-fade-up-3 hero-cta">
              <Link href={loggedIn ? "/dashboard" : "/auth"} className="btn-primary">
                {loggedIn ? "Go to Dashboard" : "Start training free"}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <Link href="#training" className="btn-outline">See training plans</Link>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <div className="relative animate-float">
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(245,200,66,0.15)", transform: "scale(1.25)" }} />
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(232,98,10,0.1)", transform: "scale(1.5)" }} />
              <div className="relative w-72 h-72 rounded-full flex items-center justify-center"
                style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(232,98,10,0.2)" }}>
                <Image src="/logo.png" alt="Connected Steps" width={220} height={220} className="rounded-full" priority />
              </div>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
