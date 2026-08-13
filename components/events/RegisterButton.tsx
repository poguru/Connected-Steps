"use client";

import { useRouter } from "next/navigation";

interface Props {
  eventId:              string;
  slug:                 string;
  price?:               number;
  startDate?:           string | null; // YYYY-MM-DD
  endDate?:             string | null; // YYYY-MM-DD
  endTime?:             string | null; // HH:MM or HH:MM:SS
  registrationClosesAt?: string | null; // full TIMESTAMPTZ ISO string
  registrationOpensAt?:  string | null; // full TIMESTAMPTZ ISO string
}

function getIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    date: ist.toISOString().split("T")[0],
    time: ist.toTimeString().split(" ")[0].substring(0, 5),
  };
}

export default function RegisterButton({ slug, price = 0, startDate, endDate, endTime, registrationClosesAt, registrationOpensAt }: Props) {
  const router = useRouter();
  const { date: today, time: nowTime } = getIST();
  const now = new Date();

  const isCompleted =
    !!(endDate && endDate < today) ||
    !!(endDate === today && endTime != null && endTime.substring(0, 5) <= nowTime) ||
    // No end_date: treat start_date as end (event is gone after that day)
    (!endDate && startDate != null && startDate < today);

  // Registration closed if registrationClosesAt TIMESTAMPTZ has passed
  const isRegistrationClosed =
    !isCompleted &&
    registrationClosesAt != null &&
    now >= new Date(registrationClosesAt);

  // Registration not yet open
  const isRegistrationNotOpen =
    !isCompleted &&
    !isRegistrationClosed &&
    registrationOpensAt != null &&
    now < new Date(registrationOpensAt);

  function handleClick() {
    router.push(`/events/${slug}/register`);
  }

  if (isCompleted) {
    return (
      <div style={{
        display: "block", width: "100%", textAlign: "center",
        padding: "14px 28px", borderRadius: "10px",
        background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)",
        fontWeight: 700, fontSize: "1rem",
        border: "1px solid rgba(255,255,255,0.1)",
        marginBottom: "1rem", letterSpacing: "0.02em",
      }}>
        Event Completed
      </div>
    );
  }

  if (isRegistrationClosed) {
    return (
      <div style={{
        display: "block", width: "100%", textAlign: "center",
        padding: "14px 28px", borderRadius: "10px",
        background: "rgba(239,68,68,0.08)", color: "#f87171",
        fontWeight: 700, fontSize: "1rem",
        border: "1px solid rgba(239,68,68,0.25)",
        marginBottom: "1rem", letterSpacing: "0.02em",
      }}>
        Registration Closed
      </div>
    );
  }

  if (isRegistrationNotOpen) {
    const opensDate = new Date(registrationOpensAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return (
      <div style={{
        display: "block", width: "100%", textAlign: "center",
        padding: "14px 28px", borderRadius: "10px",
        background: "rgba(234,179,8,0.08)", color: "#fbbf24",
        fontWeight: 700, fontSize: "1rem",
        border: "1px solid rgba(234,179,8,0.25)",
        marginBottom: "1rem", letterSpacing: "0.02em",
      }}>
        Registration opens {opensDate}
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: "block", width: "100%", textAlign: "center",
        padding: "14px 28px", borderRadius: "10px",
        background: "linear-gradient(135deg,#e8620a,#f07c2a)",
        color: "#fff", fontWeight: 700, fontSize: "1rem",
        border: "none", cursor: "pointer", marginBottom: "1rem",
        fontFamily: "inherit", boxShadow: "0 4px 20px rgba(232,98,10,0.35)",
        transition: "opacity 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
    >
      {price > 0 ? `Register — ₹${price}` : "Register Now — Free"}
    </button>
  );
}
