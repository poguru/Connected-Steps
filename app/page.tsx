import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Connected Steps — Your Goal, Our Plan",
  description: "Expert running coaching, personalised training plans, and a community built to help you hit every goal. Your first 5K or a full marathon — we run with you.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Connected Steps — Your Goal, Our Plan",
    description: "Expert coaching and a community built around your running goals.",
    url: "https://www.connectedsteps.in",
    siteName: "Connected Steps",
    type: "website",
    locale: "en_IN",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Connected Steps" }],
  },
};

export default function HomePage() {
  return <HomeClient />;
}
