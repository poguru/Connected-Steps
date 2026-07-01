"use client";

import dynamic from "next/dynamic";
import Navbar               from "@/components/layout/Navbar";
import Footer               from "@/components/layout/Footer";
import FloatingContact      from "@/components/layout/FloatingContact";
import Hero                 from "@/components/home/Hero";
import RunningJourney       from "@/components/home/RunningJourney";
import Features             from "@/components/home/Features";
import UpcomingEvents       from "@/components/home/UpcomingEvents";
import Coaches              from "@/components/home/Coaches";
import StatsAndTestimonials from "@/components/home/StatsAndTestimonials";
import CommunityQA          from "@/components/home/CommunityQA";
import MembershipPlans      from "@/components/home/MembershipPlans";
import FAQ                  from "@/components/home/FAQ";
import FinalCTA             from "@/components/home/FinalCTA";
import { SectionReveal }    from "@/components/home/SectionReveal";

// RunningAnimations uses useScroll + fixed-position overlays — load client-only
// so SSR never tries to read scrollY or matchMedia
const RunningAnimations = dynamic(
  () => import("@/components/home/RunningAnimations"),
  { ssr: false },
);

export default function HomePage() {
  return (
    <>
      {/* Scroll-triggered fitness animations (decorative, client-only) */}
      <RunningAnimations />

      <Navbar />

      {/* 1 · Hero — full-viewport entry point */}
      <Hero />

      {/* 2 · Running Journey — show the progression */}
      <RunningJourney />

      {/* 3 · Why Connected Steps — programs + sessions */}
      <SectionReveal>
        <Features />
      </SectionReveal>

      {/* 4 · Upcoming Events */}
      <SectionReveal>
        <UpcomingEvents />
      </SectionReveal>

      {/* 5 · Coaches */}
      <SectionReveal>
        <Coaches />
      </SectionReveal>

      {/* 6 · Stats + Testimonials */}
      <SectionReveal>
        <StatsAndTestimonials />
      </SectionReveal>

      {/* 7 · Community Q&A */}
      <SectionReveal>
        <CommunityQA />
      </SectionReveal>

      {/* 8 · Membership Plans */}
      <MembershipPlans />

      {/* 9 · FAQ */}
      <FAQ />

      {/* 10 · Final CTA */}
      <FinalCTA />

      <Footer />
      <FloatingContact />
    </>
  );
}
