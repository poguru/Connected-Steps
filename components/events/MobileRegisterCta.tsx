"use client";

import { useRouter } from "next/navigation";

interface Props {
  slug:  string;
  label: string;
}

export default function MobileRegisterCta({ slug, label }: Props) {
  const router = useRouter();

  function handleClick() {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    const dest = `/events/${slug}/register`;
    router.push(user ? dest : `/auth?tab=login&redirect=${encodeURIComponent(dest)}`);
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: "block", width: "100%", textAlign: "center",
        padding: "14px", borderRadius: "10px",
        background: "#e8620a", color: "#fff",
        fontWeight: 700, fontSize: "15px",
        border: "none", cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
