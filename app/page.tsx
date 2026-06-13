"use client";

import Navbar               from "@/components/layout/Navbar";
import Footer               from "@/components/layout/Footer";
import FloatingContact      from "@/components/layout/FloatingContact";
import Hero                 from "@/components/home/Hero";
import UpcomingEvents       from "@/components/home/UpcomingEvents";
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
      <UpcomingEvents />
      <Features />
      <StatsAndTestimonials />
      <Coaches />
      <CommunityQA />
      <CallToAction />
      <Footer />
      <FloatingContact />
    </>
  );
}
