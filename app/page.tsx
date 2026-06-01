"use client";

import Navbar               from "@/components/layout/Navbar";
import Footer               from "@/components/layout/Footer";
import Hero                 from "@/components/home/Hero";
import RecentSessions       from "@/components/home/RecentSessions";
import MarqueeBanner        from "@/components/home/MarqueeBanner";
import TrainingPlans        from "@/components/home/TrainingPlans";
import UpcomingSessions     from "@/components/home/UpcomingSessions";
import Coaches              from "@/components/home/Coaches";
import Features             from "@/components/home/Features";
import StatsAndTestimonials from "@/components/home/StatsAndTestimonials";
import CommunityQA         from "@/components/home/CommunityQA";
import CallToAction         from "@/components/home/CallToAction";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <RecentSessions />
      <MarqueeBanner />
      <TrainingPlans />
      <UpcomingSessions />
      <Coaches />
      <Features />
      <StatsAndTestimonials />
      <CommunityQA />
      <CallToAction />
      <Footer />
    </>
  );
}
