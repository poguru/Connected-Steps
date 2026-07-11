import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Membership Plans & Pricing – Connected Steps",
  description: "Flexible running coaching membership plans for beginners to advanced athletes. Start free, upgrade anytime.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingClient />;
}
