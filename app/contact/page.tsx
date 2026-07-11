import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact Us – Connected Steps",
  description: "Get in touch with Connected Steps — coaching questions, membership enquiries, and support via WhatsApp, email, or Instagram.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactClient />;
}
