"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import OpsHeader from "@/components/ops/OpsHeader";
import ScannerModule from "@/components/ops/ScannerModule";
import type { OpsRole } from "@/lib/ops-auth";

const ACCENT = "#fbbf24";

interface Session { uid: string; eid: string; role: OpsRole; email: string; name: string; }

export default function MedalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router   = useRouter();

  const [session,    setSession]    = useState<Session | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [count,      setCount]      = useState(0);

  useEffect(() => {
    fetch("/api/ops/auth")
      .then(r => r.ok ? r.json() : null)
      .then((s: Session | null) => {
        if (!s) { router.replace(`/ops/${slug}/login`); return; }
        setSession(s);
        fetch(`/api/ops/events/${s.eid}/live-stats`)
          .then(r => r.ok ? r.json() : null)
          .then((d: { stats?: { medal?: { done: number } } } | null) => {
            if (d?.stats?.medal) setCount(d.stats.medal.done);
          })
          .catch(() => {});
      })
      .catch(() => router.replace(`/ops/${slug}/login`));

    fetch(`/api/events/by-slug?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { event?: { title: string } } | null) => { if (d?.event?.title) setEventTitle(d.event.title); })
      .catch(() => {});
  }, [slug, router]);

  if (!session) return <Spinner />;

  return (
    <div style={pageStyle}>
      <OpsHeader slug={slug} eventTitle={eventTitle} role={session.role} volunteerName={session.name}
        countLabel={count > 0 ? `${count} issued` : undefined} accentColor={ACCENT} />
      <ScannerModule eventId={session.eid} service="medal" serviceLabel="Medals Issued" accentColor={ACCENT} onScanCount={setCount} />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#fbbf24", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" };
