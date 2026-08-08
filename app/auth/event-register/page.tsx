import { Suspense } from "react";
import EventRegisterFlow from "@/components/auth/EventRegisterFlow";

export const metadata = { title: "Register – Connected Steps" };

export default function EventRegisterPage() {
  return (
    <main
      style={{
        minHeight:      "100dvh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "24px 16px",
        background:     "var(--background)",
      }}
    >
      <Suspense fallback={<div />}>
        <EventRegisterFlow />
      </Suspense>
    </main>
  );
}
