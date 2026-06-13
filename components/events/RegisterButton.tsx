"use client";

import { useRouter } from "next/navigation";

export default function RegisterButton({ slug }: { slug: string }) {
  const router = useRouter();

  function handleClick() {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    if (user) {
      // Already authenticated — stay on this page (already viewing the event)
      // Scroll to top to confirm they are on the right page
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const dest = `/events/${slug}`;
      router.push(`/auth?tab=login&redirect=${encodeURIComponent(dest)}`);
    }
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
      }}
    >
      Register for this event
    </button>
  );
}
