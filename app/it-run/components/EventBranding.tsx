/**
 * IT Run Sprint-2 Event Branding Components
 * Premium branded elements for registration experience
 */

import Image from "next/image";
import type { ItRunEventMeta } from "@/lib/it-run-types";

const ACCENT = "#e8620a";
const EVENT_ORANGE = "#e8620a";
const DARK_BG = "#080808";
const TEXT_LIGHT = "#ffffff";

// ─────────────────────────────────────────────────────────────────────────────
// EventRegistrationHeader — Full branded header for landing/category page
// ─────────────────────────────────────────────────────────────────────────────

export function EventRegistrationHeader({
  event,
  eventLogoUrl,
}: {
  event: ItRunEventMeta | null;
  eventLogoUrl?: string; // Reusable: pass event logo URL
}) {
  const eventDate = event?.event_date
    ? new Date(event.event_date + "T12:00:00Z").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${DARK_BG} 0%, #0f0f0f 100%)`,
        borderBottom: `2px solid ${EVENT_ORANGE}20`,
        paddingTop: 32,
        paddingBottom: 48,
        marginBottom: 40,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 clamp(1rem, 4vw, 2rem)",
        }}
      >
        {/* Connected Steps Organizer Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 24,
          }}
        >
          <img
            src="/logo.png"
            alt="Connected Steps"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255, 255, 255, 0.5)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Hosted by Connected Steps
          </span>
        </div>

        {/* Event Logo + Name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {eventLogoUrl && (
            <div
              style={{
                width: "clamp(80px, 12vw, 140px)",
                height: "auto",
                flexShrink: 0,
              }}
            >
              <img
                src={eventLogoUrl}
                alt={event?.title ?? "Event"}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                }}
              />
            </div>
          )}

          <div>
            <h1
              style={{
                fontSize: "clamp(24px, 5vw, 42px)",
                fontWeight: 900,
                margin: 0,
                color: TEXT_LIGHT,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              THE IT RUN
              <br />
              SPRINT-2
            </h1>
          </div>
        </div>

        {/* Event Details */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 14,
            color: "rgba(255, 255, 255, 0.65)",
            marginLeft: eventLogoUrl ? "clamp(80px, 12vw, 140px)" : 0,
          }}
        >
          {event?.venue_name && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: EVENT_ORANGE }}>📍</span>
              <span>{event.venue_name}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: EVENT_ORANGE }}>📅</span>
            <span>{eventDate}</span>
          </div>
          {event?.report_time && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: EVENT_ORANGE }}>⏰</span>
              <span>Report at {event.report_time}</span>
            </div>
          )}
        </div>

        {/* Sponsors Section */}
        {/*
          Sponsors are stored in: /public/events/it-run-sprint-2/sponsors/

          To add sponsors:
          1. Save logo files to that directory (png, jpg, webp)
          2. Update the sponsorsConfig in EventSponsors below
          3. That's it - no code changes needed!

          Supported tiers:
          - title: Primary sponsors (largest logos)
          - associate: Associate sponsors (medium logos)
          - supporting: Supporting partners (smaller logos)
          - hydration/tshirt/timing/etc: Category-specific partners
        */}
        <EventSponsors eventName="it-run-sprint-2" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventSponsors — Load sponsor logos from event directory
// ─────────────────────────────────────────────────────────────────────────────

interface SponsorConfig {
  tier: "title" | "associate" | "supporting" | string;
  logos: Array<{ filename: string; name?: string; url?: string }>;
}

export function EventSponsors({ eventName }: { eventName: string }) {
  // TODO: Update this config when adding sponsors
  // Sponsors will be loaded from: /public/events/{eventName}/sponsors/{filename}
  const sponsorConfig: SponsorConfig[] = [
    // Example config (uncomment and update when adding sponsors):
    // {
    //   tier: "title",
    //   logos: [
    //     { filename: "title-sponsor-1.png", name: "Sponsor Name", url: "https://sponsor.com" }
    //   ]
    // },
    // {
    //   tier: "associate",
    //   logos: [
    //     { filename: "associate-sponsor-1.png", name: "Associate Name" },
    //     { filename: "associate-sponsor-2.png", name: "Associate Name 2" }
    //   ]
    // },
    // {
    //   tier: "hydration",
    //   logos: [
    //     { filename: "hydration-partner.png", name: "Hydration Partner" }
    //   ]
    // }
  ];

  if (!sponsorConfig.length) {
    return null; // No sponsors configured yet
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 32, borderTop: `1px solid rgba(255,255,255,0.08)` }}>
      {sponsorConfig.map((tier) => (
        <div key={tier.tier} style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 16,
            }}
          >
            {tier.tier === "title"
              ? "Title Sponsor"
              : tier.tier === "associate"
                ? "Associate Sponsors"
                : tier.tier === "supporting"
                  ? "Supporting Partners"
                  : tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1) + " Partner"}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              alignItems: "center",
            }}
          >
            {tier.logos.map((logo, idx) => (
              <a
                key={idx}
                href={logo.url || "#"}
                target={logo.url ? "_blank" : undefined}
                rel={logo.url ? "noopener noreferrer" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: tier.tier === "title" ? 80 : tier.tier === "associate" ? 60 : 50,
                  opacity: 0.9,
                  transition: "opacity 0.2s",
                  textDecoration: "none",
                  cursor: logo.url ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  if (logo.url) e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.9";
                }}
              >
                <img
                  src={`/events/${eventName}/sponsors/${logo.filename}`}
                  alt={logo.name || "Sponsor"}
                  title={logo.name}
                  style={{
                    maxHeight: tier.tier === "title" ? 80 : tier.tier === "associate" ? 60 : 50,
                    maxWidth: 200,
                    objectFit: "contain",
                  }}
                />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompactEventHeader — Minimal header for steps 2-6
// ─────────────────────────────────────────────────────────────────────────────

export function CompactEventHeader({
  step,
  stepLabel,
  participantName,
}: {
  step: number;
  stepLabel: string;
  participantName?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 32,
        paddingBottom: 20,
        borderBottom: `1px solid rgba(255, 255, 255, 0.08)`,
      }}
    >
      {/* Compact logo */}
      <div
        style={{
          width: 56,
          height: 56,
          flexShrink: 0,
          opacity: 0.9,
        }}
      >
        <img
          src="/events/it-run-sprint-2/IT Run Sprint-2 Logo.jpeg"
          alt="The IT Run Sprint-2"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>

      {/* Step info */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255, 255, 255, 0.4)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 4,
          }}
        >
          Step {step} of 6 · {stepLabel}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: TEXT_LIGHT,
          }}
        >
          THE IT RUN SPRINT-2
        </div>
        {participantName && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.5)",
              marginTop: 4,
            }}
          >
            {participantName}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventProgressIndicator — Premium progress bar + step indicator
// ─────────────────────────────────────────────────────────────────────────────

export function EventProgressIndicator({
  currentStep,
  totalSteps = 6,
}: {
  currentStep: number;
  totalSteps?: number;
}) {
  const pct = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Progress track */}
      <div
        style={{
          height: 3,
          background: "rgba(255, 255, 255, 0.07)",
          borderRadius: 2,
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${EVENT_ORANGE}cc, ${EVENT_ORANGE})`,
            transition: "width 0.5s cubic-bezier(.4,0,.2,1)",
            borderRadius: 2,
          }}
        />
      </div>

      {/* Step dots */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <div
              key={stepNum}
              style={{
                width: isCurrent ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: isComplete
                  ? EVENT_ORANGE
                  : isCurrent
                    ? EVENT_ORANGE
                    : "rgba(255, 255, 255, 0.08)",
                transition: "all 0.3s",
                cursor: isComplete ? "pointer" : "default",
              }}
              title={`Step ${stepNum}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventRegistrationShell — Wraps registration forms with branding
// ─────────────────────────────────────────────────────────────────────────────

export function EventRegistrationShell({
  children,
  showLogo = false,
}: {
  children: React.ReactNode;
  showLogo?: boolean;
}) {
  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "0 clamp(1rem, 4vw, 2rem) clamp(2rem, 6vw, 4rem)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {showLogo && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 48,
            marginTop: 32,
          }}
        >
          <div style={{ width: 120, height: "auto", margin: "0 auto" }}>
            <img
              src="/events/it-run-sprint-2/IT Run Sprint-2 Logo.jpeg"
              alt="The IT Run Sprint-2"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
              }}
            />
          </div>
        </div>
      )}

      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventRegistrationSummary — Sticky summary bar for desktop
// ─────────────────────────────────────────────────────────────────────────────

export function EventRegistrationSummary({
  categoryName,
  participantCount,
  price,
  onContinue,
}: {
  categoryName: string;
  participantCount: number;
  price: number;
  onContinue?: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        background: "rgba(8, 8, 8, 0.97)",
        backdropFilter: "blur(20px)",
        borderTop: `1px solid ${EVENT_ORANGE}20`,
        padding: `12px clamp(1rem, 4vw, 2rem) calc(12px + env(safe-area-inset-bottom, 0px))`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        <div
          style={{
            width: 40,
            height: 40,
            opacity: 0.8,
            flexShrink: 0,
          }}
        >
          <img
            src="/events/it-run-sprint-2/IT Run Sprint-2 Logo.jpeg"
            alt="The IT Run Sprint-2"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.4)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            THE IT RUN SPRINT-2
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: TEXT_LIGHT,
            }}
          >
            {categoryName} · {participantCount} participant{participantCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: EVENT_ORANGE,
            textAlign: "right",
          }}
        >
          ₹{price.toLocaleString("en-IN")}
        </div>
        {onContinue && (
          <button
            onClick={onContinue}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: EVENT_ORANGE,
              color: "white",
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventWatermark — Subtle background logo (very low opacity)
// ─────────────────────────────────────────────────────────────────────────────

export function EventWatermark() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: -100,
        right: -100,
        width: 500,
        height: 500,
        opacity: 0.04,
        pointerEvents: "none",
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      <img
        src="/events/it-run-sprint-2/IT Run Sprint-2 Logo.jpeg"
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EventSuccessScreen — Branded confirmation page
// ─────────────────────────────────────────────────────────────────────────────

export function EventSuccessScreen({
  registrationCode,
  category,
  participants,
  finalPrice,
  dashboardUrl,
}: {
  registrationCode: string;
  category: string;
  participants: string[];
  finalPrice: number;
  /** Signed dashboard link from the register API. Omitted when unavailable (the email still has one). */
  dashboardUrl?: string;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 20px",
        maxWidth: 600,
        margin: "0 auto",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 140,
          height: "auto",
          margin: "0 auto 32px",
        }}
      >
        <img
          src="/events/it-run-sprint-2/IT Run Sprint-2 Logo.jpeg"
          alt="The IT Run Sprint-2"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
          }}
        />
      </div>

      {/* Success message */}
      <h1
        style={{
          fontSize: 32,
          fontWeight: 900,
          color: TEXT_LIGHT,
          margin: "0 0 16px",
          letterSpacing: "-0.01em",
        }}
      >
        Registration Confirmed! 🎉
      </h1>

      {dashboardUrl && (
        <a
          href={dashboardUrl}
          style={{
            display: "inline-block",
            margin: "0 0 24px",
            padding: "12px 24px",
            borderRadius: 10,
            background: "#e8620a",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          View my registration dashboard
        </a>
      )}

      <p
        style={{
          fontSize: 16,
          color: "rgba(255, 255, 255, 0.7)",
          margin: "0 0 32px",
          lineHeight: 1.6,
        }}
      >
        You're officially part of <strong>THE IT RUN SPRINT-2</strong>
      </p>

      {/* Summary card */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 12,
          padding: 24,
          marginBottom: 32,
          textAlign: "left",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 6,
              letterSpacing: "0.08em",
            }}
          >
            Registration ID
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: EVENT_ORANGE,
              fontFamily: "monospace",
            }}
          >
            {registrationCode}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 6,
              letterSpacing: "0.08em",
            }}
          >
            Category
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: TEXT_LIGHT,
            }}
          >
            {category}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 12,
              letterSpacing: "0.08em",
            }}
          >
            Participants ({participants.length})
          </div>
          {participants.map((name, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.8)",
                marginBottom: idx < participants.length - 1 ? 8 : 0,
                paddingLeft: 12,
                borderLeft: `2px solid ${EVENT_ORANGE}`,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* Price */}
      <div
        style={{
          fontSize: 13,
          color: "rgba(255, 255, 255, 0.6)",
          marginBottom: 32,
        }}
      >
        Total: <strong style={{ color: EVENT_ORANGE }}>₹{finalPrice.toLocaleString("en-IN")}</strong>
      </div>
    </div>
  );
}
