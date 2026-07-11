import type { Metadata } from "next";
import SessionsPageClient from "./SessionsPageClient";

export const metadata: Metadata = {
  title: "Training Sessions – Connected Steps",
  description: "Upcoming running and training sessions across Hyderabad — strength, mobility, speed, long run and more. Join a session near you.",
  alternates: { canonical: "/sessions" },
};

export default function SessionsPage() {
  return <SessionsPageClient />;
}
