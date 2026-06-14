"use client";

import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  slug:    string;
  price?:  number;
  // Lifecycle fields for status computation
  startDate?:             string | null; // YYYY-MM-DD
  endDate?:               string | null; // YYYY-MM-DD
  endTime?:               string | null; // HH:MM or HH:MM:SS
  registrationCloseTime?: string | null; // HH:MM or HH:MM:SS (applies on startDate)
}

function getIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    date: ist.toISOString().split("T")[0],                  // "YYYY-MM-DD"
    time: ist.toTimeString().split(" ")[0].substring(0, 5), // "HH:MM"
  };
}

export default function RegisterButton({ slug, price = 0, startDate, endDate, endTime, registrationCloseTime }: Props) {
  const router = useRouter();
  const { date: today, time: nowTime } = getIST();

  const isCompleted =
    !!(endDate && endDate < today) ||
    !!(endDate === today && endTime != null && endTime.substring(0, 5) <= nowTime);

  // Registration closes at registrationCloseTime on startDate
  const isRegistrationClosed =
    !isCompleted &&
    registrationCloseTime != null &&
    startDate != null &&
    (today > startDate || (today === startDate && nowTime >= registrationCloseTime.substring(0, 5)));

  function handleClick() {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    const dest = `/events/${slug}/register`;
    if (user) {
      router.push(dest);
    } else {
      sessionStorage.setItem("cs_post_login_redirect", dest);
      router.push("/auth?tab=login");
    }
  }

  if (isCompleted) {
    return (
      <div style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "14px 28px",
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.35)",
        fontWeight: 700,
        fontSize: "1rem",
        border: "1px solid rgba(255,255,255,0.1)",
        marginBottom: "1rem",
        letterSpacing: "0.02em",
      }}>
        Event Completed
      </div>
    );
  }

  if (isRegistrationClosed) {
    return (
      <div style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "14px 28px",
        borderRadius: "10px",
        background: "rgba(239,68,68,0.08)",
        color: "#f87171",
        fontWeight: 700,
        fontSize: "1rem",
        border: "1px solid rgba(239,68,68,0.25)",
        marginBottom: "1rem",
        letterSpacing: "0.02em",
      }}>
        Registration Closed
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "14px 28px",
        borderRadius: "10px",
        background: "linear-gradient(135deg,#e8620a,#f07c2a)",
        color: "#fff",
        fontWeight: 700,
        fontSize: "1rem",
        border: "none",
        cursor: "pointer",
        marginBottom: "1rem",
        fontFamily: "inherit",
        boxShadow: "0 4px 20px rgba(232,98,10,0.35)",
        transition: "opacity 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
    >
      {price > 0 ? `Register — ₹${price}` : "Register Now — Free"}
    </button>
  );
}
