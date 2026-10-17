import Link from "next/link";
import Image from "next/image";
import { FEATURED_EVENT, FEATURED_EVENT_VISIBLE } from "@/lib/it-run-featured";

/** The IT Run Sprint-2 on the homepage: a flagship campaign panel with the one registration CTA. */
export default function FlagshipEvent() {
  if (!FEATURED_EVENT_VISIBLE) return null;
  return (
    <section aria-labelledby="flagship-event-title" style={{
      maxWidth: 1100, margin: "0 auto", padding: "clamp(40px,6vw,72px) 16px",
    }}>
      <div style={{
        background: "linear-gradient(135deg, rgba(249,115,22,0.14), rgba(0,0,0,0) 60%), #0b0b0b",
        border: "1px solid rgba(249,115,22,0.35)", borderRadius: 16, padding: "clamp(20px,4vw,40px)",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: "clamp(16px,3vw,32px)",
      }}>
        <div style={{ flex: "1 1 260px", minWidth: 0, textAlign: "center" }}>
          <Image src={FEATURED_EVENT.logo} alt={`${FEATURED_EVENT.name} ${FEATURED_EVENT.edition} logo`}
            width={360} height={200} style={{ width: "100%", maxWidth: 320, height: "auto" }} />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
            Flagship event
          </div>
          <h2 id="flagship-event-title" style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 800, color: "#fff", margin: "0 0 6px", lineHeight: 1.15 }}>
            {FEATURED_EVENT.name} {FEATURED_EVENT.edition}
          </h2>
          <p style={{ fontSize: "clamp(15px,2vw,17px)", color: "#f97316", fontStyle: "italic", margin: "0 0 12px" }}>
            {FEATURED_EVENT.tagline}
          </p>
          <p style={{ fontSize: 15, color: "#d4d4d4", margin: "0 0 6px", fontWeight: 600 }}>{FEATURED_EVENT.dateLabel}</p>
          <p style={{ fontSize: 14, color: "#a3a3a3", margin: "0 0 20px", lineHeight: 1.6 }}>
            A flagship running experience by Connected Steps. Choose your category and take your next step.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href={FEATURED_EVENT.href} style={{
              background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15,
              padding: "12px 22px", borderRadius: 10, textDecoration: "none",
            }}>
              Register Now →
            </Link>
            <Link href={FEATURED_EVENT.href} style={{
              border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontWeight: 600, fontSize: 15,
              padding: "12px 22px", borderRadius: 10, textDecoration: "none",
            }}>
              View Event Details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
