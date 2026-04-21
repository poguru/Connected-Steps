"use client";

import Link from "next/link";
import Image from "next/image";

export default function CallToAction() {
  return (
    <section className="section relative overflow-hidden noise" style={{ background: "var(--cs-black)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(232,98,10,0.15) 0%, transparent 70%)" }} />
      <div className="container relative z-10 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-center mb-8">
            <Image src="/logo.png" alt="Connected Steps" width={80} height={80} className="rounded-full opacity-90" />
          </div>
          <div className="section-label mb-4">Join Connected Steps</div>
          <h2 className="font-display mb-6"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 300, color: "var(--cs-cream)", lineHeight: 1.1 }}>
            Your goal is waiting.
            <br /><em className="not-italic" style={{ color: "var(--cs-orange)" }}>We have the plan.</em>
          </h2>
          <p className="text-base leading-relaxed mb-10"
            style={{ color: "var(--cs-muted)", maxWidth: "480px", margin: "0 auto 2.5rem" }}>
            Start free today. No credit card needed. Your first training week is on us.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/auth" className="btn-primary" style={{ fontSize: "15px", padding: "16px 40px" }}>
              Start training free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/pricing" className="btn-outline" style={{ fontSize: "15px", padding: "16px 40px" }}>View pricing</Link>
          </div>
          <p className="mt-6 text-xs tracking-wide" style={{ color: "rgba(154,128,112,0.6)" }}>
            Free plan available · No commitment · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
