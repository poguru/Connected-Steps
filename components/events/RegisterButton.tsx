"use client";

import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  slug:    string;
  price?:  number;
}

export default function RegisterButton({ slug, price = 0 }: Props) {
  const router = useRouter();

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
