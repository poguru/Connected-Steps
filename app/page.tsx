"use client";

import Navbar               from "@/components/layout/Navbar";
import Footer               from "@/components/layout/Footer";
import Hero                 from "@/components/home/Hero";
import MarqueeBanner        from "@/components/home/MarqueeBanner";
import TrainingPlans        from "@/components/home/TrainingPlans";
import Features             from "@/components/home/Features";
import StatsAndTestimonials from "@/components/home/StatsAndTestimonials";
import CallToAction         from "@/components/home/CallToAction";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <MarqueeBanner />
      <TrainingPlans />
      <Features />
      <StatsAndTestimonials />
      <CallToAction />
      <Footer />
    </>
  );
}
