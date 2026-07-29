import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/events/[id]/ai/draft-message
// Body: { intent: string; segment: string; channel?: "email" | "whatsapp" }
// Returns: { subject: string; body_html: string }
// Requires ANTHROPIC_API_KEY in environment.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI drafts are not configured (ANTHROPIC_API_KEY missing)" }, { status: 503 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as { intent?: string; segment?: string; channel?: string };

  if (!body.intent?.trim()) return NextResponse.json({ error: "intent is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: ev } = await db
    .from("events")
    .select("title, start_date, start_time, location, distance_categories, participant_count")
    .eq("id", eventId)
    .single();

  const eventDate  = ev?.start_date
    ? new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "TBD";
  const distances  = Array.isArray(ev?.distance_categories) ? (ev.distance_categories as string[]).join(", ") : "various distances";
  const regCount   = ev?.participant_count ?? 0;
  const channel    = body.channel === "whatsapp" ? "WhatsApp" : "email";
  const isWhatsapp = channel === "WhatsApp";

  const systemPrompt = `You are a helpful event communications assistant for Connected Steps, a running event organiser in India.
Write clear, warm, and professional ${channel} messages for race participants.
${isWhatsapp ? "WhatsApp messages should be short (under 300 chars for the body), use line breaks, and avoid HTML." : "Email body must be valid HTML with inline styling. Keep the HTML clean and email-client safe (tables, inline styles)."}
Always address participants warmly. Do not use placeholder text like [your name] — if specific info is missing, write around it naturally.
Return ONLY a JSON object with "subject" and "body_html" (or "body" for WhatsApp) fields. No markdown, no explanation.`;

  const userPrompt = `Event details:
- Name: ${ev?.title ?? "Connected Steps Event"}
- Date: ${eventDate}
- Location: ${ev?.location ?? "TBD"}
- Distances: ${distances}
- Registered participants: ${regCount}

Recipient segment: ${body.segment ?? "all confirmed registrants"}

Coordinator's intent / instruction:
${body.intent.trim()}

Write the ${channel} message now. Return JSON with "subject" and "body_html".`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[AI draft] Anthropic API error:", res.status, err);
      return NextResponse.json({ error: "AI service error — please try again" }, { status: 502 });
    }

    interface AnthropicResponse {
      content: Array<{ type: string; text: string }>;
    }

    const aiRes = await res.json() as AnthropicResponse;
    const text  = aiRes.content?.[0]?.text ?? "";

    // Extract JSON from the response (may be wrapped in code fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not parse AI response — try again" }, { status: 502 });

    const draft = JSON.parse(jsonMatch[0]) as { subject?: string; body_html?: string; body?: string };
    return NextResponse.json({
      subject:   draft.subject   ?? "",
      body_html: draft.body_html ?? draft.body ?? "",
    });
  } catch (e) {
    console.error("[AI draft] fetch error:", e);
    return NextResponse.json({ error: "Failed to reach AI service" }, { status: 502 });
  }
}
