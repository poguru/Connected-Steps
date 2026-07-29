import { NextRequest } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/ops/stream
// Server-Sent Events stream for the Command Center.
// Forwards cookies from the incoming request to internal API calls so auth is preserved.
//
// Event types pushed:
//   event: initial    — full snapshot on connect (OpsResponse + scans + volunteers)
//   event: metrics    — updated OpsResponse every ~9 s
//   event: scans      — incremental new scans every ~3 s (only rows newer than last push)
//   event: volunteers — volunteer snapshot every ~9 s
//   : ping            — heartbeat comment every ~15 s (prevents proxy idle-close)
//
// EventSource reconnects automatically on disconnect; each reconnect re-sends "initial"
// so the client always gets a fresh full snapshot.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: eventId } = await params;
  // Derive the origin from the incoming request (works in dev and prod without env vars)
  const origin = req.nextUrl.origin;
  const fwdHeaders = { cookie: req.headers.get("cookie") ?? "" };

  // Thin wrapper around the existing per-resource API routes
  const api = async (path: string) => {
    try {
      const res = await fetch(`${origin}${path}`, { headers: fwdHeaders });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  };

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      // ── Initial full snapshot ────────────────────────────────────────────
      const [metrics, scansData, volData] = await Promise.all([
        api(`/api/admin/events/${eventId}/ops`),
        api(`/api/admin/events/${eventId}/ops/scans?limit=60`),
        api(`/api/admin/events/${eventId}/ops/volunteers`),
      ]);

      if (!metrics || closed) { controller.close(); return; }

      emit("initial", {
        ...metrics,
        scans:      scansData?.scans      ?? [],
        volunteers: volData?.volunteers   ?? [],
      });

      // Track the newest scan timestamp so subsequent pushes are incremental
      let scanSince: string | null = scansData?.scans?.[0]?.created_at ?? null;
      let tick = 0;

      // ── Live poll loop ───────────────────────────────────────────────────
      while (!closed) {
        await new Promise<void>(resolve => setTimeout(resolve, 3000));
        if (closed) break;

        tick++;

        // Incremental scans on every tick (~3 s)
        const scanQ = scanSince
          ? `/api/admin/events/${eventId}/ops/scans?limit=60&since=${encodeURIComponent(scanSince)}`
          : `/api/admin/events/${eventId}/ops/scans?limit=60`;
        const newScansData = await api(scanQ);
        const newScans: Array<{ created_at: string }> = newScansData?.scans ?? [];
        if (newScans.length > 0) {
          emit("scans", newScansData);
          scanSince = newScans[0].created_at;
        }

        // Metrics + volunteers every ~9 s (every 3rd tick)
        if (tick % 3 === 0) {
          const [m, v] = await Promise.all([
            api(`/api/admin/events/${eventId}/ops`),
            api(`/api/admin/events/${eventId}/ops/volunteers`),
          ]);
          if (m) emit("metrics", m);
          if (v) emit("volunteers", v);
        }

        // Heartbeat comment every ~15 s (every 5th tick) to prevent proxy idle-close
        if (tick % 5 === 0 && !closed) {
          try { controller.enqueue(encoder.encode(": ping\n\n")); }
          catch { closed = true; }
        }
      }
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
