import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signWebhookPayload } from "@/lib/webhook-dispatch";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data: sub } = await db
    .from("webhook_subscriptions")
    .select("organization_id, url, signing_secret, is_active, timeout_seconds")
    .eq("id", id)
    .single();

  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, (sub as { organization_id: string }).organization_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(sub as { is_active: boolean }).is_active) {
    return NextResponse.json({ error: "Webhook is disabled" }, { status: 400 });
  }

  const testPayload = {
    event: "test",
    timestamp: new Date().toISOString(),
    data: {
      message:     "This is a test delivery from Connected Steps.",
      triggered_by: actorEmail(ctx),
    },
  };

  const body      = JSON.stringify(testPayload);
  const signature = signWebhookPayload(body, (sub as { signing_secret: string }).signing_secret);
  const timeoutMs = Math.min(((sub as { timeout_seconds: number }).timeout_seconds ?? 30) * 1000, 30_000);

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  let http_status: number | null = null;
  let response_body: string | null = null;
  let error_message: string | null = null;
  let latency_ms: number | null = null;

  const start = Date.now();
  try {
    const res = await fetch((sub as { url: string }).url, {
      method:  "POST",
      headers: {
        "Content-Type":       "application/json",
        "X-CS-Signature":     signature,
        "X-CS-Event":         "test",
        "X-CS-Delivery-Id":   "test",
        "X-CS-Timestamp":     new Date().toISOString(),
      },
      body,
      signal: controller.signal,
    });
    latency_ms    = Date.now() - start;
    http_status   = res.status;
    response_body = await res.text().catch(() => null);
  } catch (err) {
    latency_ms    = Date.now() - start;
    error_message = err instanceof Error ? err.message : "Unknown error";
  } finally {
    clearTimeout(timer);
  }

  const success = http_status !== null && http_status >= 200 && http_status < 300;

  return NextResponse.json({
    data: {
      success,
      http_status,
      latency_ms,
      response_body,
      error_message,
      payload_sent: testPayload,
    },
  });
}
