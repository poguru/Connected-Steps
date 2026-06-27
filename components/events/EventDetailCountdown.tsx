"use client";

/**
 * Client wrapper that adds a live countdown to the server-rendered event
 * detail page. The server page passes the raw event timestamps; this component
 * handles all timer logic client-side without any server polling.
 */

import EventCountdown from "@/components/events/EventCountdown";
import type { LifecycleEvent } from "@/lib/event-lifecycle";

interface Props {
  event: LifecycleEvent;
}

export default function EventDetailCountdown({ event }: Props) {
  return (
    <div style={{
      margin: "0 0 1.5rem",
      padding: "1.25rem 1.5rem",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <EventCountdown event={event} />
    </div>
  );
}
