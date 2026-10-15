import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { sanitizeEmailHtml } from "@/lib/it-run-email-html";
import {
  selectRecipients, loadEventRunners, buildEventUpdateHtml, queueBatch, processBatch,
  requeueRetryable, batchSummary, type RecipientFilter,
} from "@/lib/it-run-email-campaign";
import { buildCategoryConfirmation } from "@/lib/it-run-email";

// Event emails from the admin portal. Every action works inside one event (sprint-2) and queues rows in the email
// queue; sending happens in bounded batches through "process". Nothing here changes registrations, payments or QR codes.
//
// POST actions:
//   preview_update        { subject, body, filter }                -> recipient count and a preview. Sends nothing.
//   queue_update          { batchId, subject, body, filter }       -> queues one email per recipient
//   queue_confirmation    { batchId, participantIds }              -> queues the confirmation for each runner's category
//   process               { batchId }                              -> sends the next bounded group of queued emails
//   retry_failed          { batchId }                              -> requeues retryable failures, then sends them
// GET actions:
//   ?action=history                                                -> recent batches with counts per status
//   ?action=batch&batchId=...                                      -> one batch's counts

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["paid", "free", "pending", "payment_attempted", "failed", "partially_refunded"];

function cleanFilter(raw: unknown): RecipientFilter | { error: string } {
  const f = (raw ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const categoryIds = strings(f.categoryIds);
  const participantIds = strings(f.participantIds);
  const paymentStatuses = strings(f.paymentStatuses).filter(s => STATUSES.includes(s));
  if (categoryIds.some(id => !UUID.test(id)) || participantIds.some(id => !UUID.test(id))) return { error: "Choose valid categories and participants." };
  const registeredFrom = typeof f.registeredFrom === "string" && f.registeredFrom ? f.registeredFrom : undefined;
  const registeredTo = typeof f.registeredTo === "string" && f.registeredTo ? f.registeredTo : undefined;
  if ((registeredFrom && !DATE.test(registeredFrom)) || (registeredTo && !DATE.test(registeredTo))) return { error: "Dates must be YYYY-MM-DD." };
  return { categoryIds, participantIds, paymentStatuses, registeredFrom, registeredTo };
}

function cleanUpdate(subject: unknown, body: unknown): { subject: string; html: string } | { error: string } {
  const s = typeof subject === "string" ? subject.trim() : "";
  if (s.length < 3 || s.length > 150 || /[\r\n]/.test(s)) return { error: "The subject must be 3 to 150 characters on one line." };
  const raw = typeof body === "string" ? body : "";
  if (raw.trim().length < 3 || raw.length > 10000) return { error: "The message must be 3 to 10000 characters." };
  const html = sanitizeEmailHtml(raw);
  if (html.replace(/<[^>]+>/g, "").trim().length === 0) return { error: "The message needs some text." };
  return { subject: s, html };
}

async function eventId(db: ReturnType<typeof getSupabaseServer>): Promise<string | null> {
  const { data } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function audit(db: ReturnType<typeof getSupabaseServer>, args: {
  eventId: string; actor: string; role: string; ip: string; action: string; batchId: string; detail: Record<string, unknown>;
}) {
  // Counts and settings only: no addresses and no message text
  await db.from("it_run_audit_logs").insert({
    event_id: args.eventId, actor_email: args.actor, actor_role: args.role,
    action: args.action, entity_type: "email_batch", entity_id: args.batchId, ip: args.ip, detail: args.detail,
  }).then(() => {}, () => {});
}

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const ev = await eventId(db);
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const action = String(body.action ?? "");

  if (action === "preview_update" || action === "queue_update") {
    const filter = cleanFilter(body.filter);
    if ("error" in filter) return NextResponse.json({ error: filter.error }, { status: 400 });
    const update = cleanUpdate(body.subject, body.body);
    if ("error" in update) return NextResponse.json({ error: update.error }, { status: 400 });

    // The recipients are chosen on the server, from this event only. The client's count is never trusted.
    const runners = await loadEventRunners(db, ev);
    const selection = selectRecipients(runners, filter);

    if (action === "preview_update") {
      return NextResponse.json({
        recipientCount: selection.recipients.length,
        excludedInvalid: selection.excludedInvalid,
        excludedDuplicate: selection.excludedDuplicate,
        subject: update.subject,
        previewHtml: buildEventUpdateHtml("Participant", update.html),
      });
    }

    const batchId = String(body.batchId ?? "");
    if (!UUID.test(batchId)) return NextResponse.json({ error: "A batch id is required." }, { status: 400 });
    if (selection.recipients.length === 0) return NextResponse.json({ error: "No eligible recipients match this selection." }, { status: 400 });

    const queued = await queueBatch(db, {
      batchId, eventId: ev, emailType: "event_update", subject: update.subject,
      createdBy: session.email ?? "admin",
      recipients: selection.recipients.map(r => ({
        email: r.email, name: r.name, registrationId: r.registrationId, participantId: r.participantId,
        html: buildEventUpdateHtml(r.name || "there", update.html),
      })),
    });
    if (queued.status === "queued") {
      await audit(db, {
        eventId: ev, actor: session.email ?? "admin", role: session.role ?? "event_admin", ip: getClientIp(req),
        action: "email_update_queued", batchId, detail: { recipients: queued.count, excludedInvalid: selection.excludedInvalid, filter: { ...filter, participantIds: filter.participantIds?.length ?? 0 } },
      });
    }
    return NextResponse.json({ ok: true, status: queued.status, count: queued.count });
  }

  if (action === "queue_confirmation") {
    const batchId = String(body.batchId ?? "");
    if (!UUID.test(batchId)) return NextResponse.json({ error: "A batch id is required." }, { status: 400 });
    const ids = Array.isArray(body.participantIds) ? body.participantIds.filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0 || ids.length > 100 || ids.some(id => !UUID.test(id))) {
      return NextResponse.json({ error: "Choose 1 to 100 valid runners." }, { status: 400 });
    }
    // Every runner must belong to this event. A runner from another event is refused, not skipped.
    const runners = await loadEventRunners(db, ev);
    const inEvent = new Map(runners.map(r => [r.id, r]));
    if (ids.some(id => !inEvent.has(id))) return NextResponse.json({ error: "A runner is not part of this event." }, { status: 403 });

    // One confirmation per runner's category in each registration, however many of its runners were chosen
    const groups = new Map<string, string>();
    for (const id of ids) {
      const r = inEvent.get(id)!;
      const key = `${r.registration_id}|${r.category_id ?? r.registration_category_id}`;
      if (!groups.has(key)) groups.set(key, id);
    }

    const rows: Array<{ email: string; name: string; registrationId: string; participantId: string; html: string; subject: string }> = [];
    let subject = "";
    for (const [key, participantId] of groups) {
      const built = await buildCategoryConfirmation(key.split("|")[0], participantId);
      if (!built) continue;
      subject = built.subject;
      for (const to of built.recipients) {
        rows.push({ email: to.toLowerCase(), name: built.name, registrationId: key.split("|")[0], participantId, html: built.html, subject: built.subject });
      }
    }
    if (rows.length === 0) return NextResponse.json({ error: "No confirmation could be built for these runners." }, { status: 400 });

    // The batch's subject is the first email's; each row keeps its own subject for its category
    const queued = await queueBatch(db, {
      batchId, eventId: ev, emailType: "confirmation_resend", subject: subject || "Registration Confirmed - The IT Run Sprint-2",
      createdBy: session.email ?? "admin",
      recipients: rows.map(r => ({ email: r.email, name: r.name, registrationId: r.registrationId, participantId: r.participantId, html: r.html })),
    });
    if (queued.status === "queued") {
      await audit(db, {
        eventId: ev, actor: session.email ?? "admin", role: session.role ?? "event_admin", ip: getClientIp(req),
        action: "email_confirmation_resend_queued", batchId, detail: { runners: ids.length, categories: groups.size, emails: queued.count },
      });
    }
    return NextResponse.json({ ok: true, status: queued.status, count: queued.count });
  }

  if (action === "process" || action === "retry_failed") {
    const batchId = String(body.batchId ?? "");
    if (!UUID.test(batchId)) return NextResponse.json({ error: "A batch id is required." }, { status: 400 });
    // The batch must belong to this event
    const { data: owned } = await db.from("email_queue").select("id").eq("batch_id", batchId).eq("event_id", ev).limit(1);
    if (!owned?.length) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

    const requeued = action === "retry_failed" ? await requeueRetryable(db, batchId) : 0;
    const result = await processBatch(db, batchId, { limit: 25 });
    const summary = await batchSummary(db, batchId);
    return NextResponse.json({ ok: true, requeued, ...result, summary });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const ev = await eventId(db);
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const action = req.nextUrl.searchParams.get("action") ?? "history";
  if (action === "batch") {
    const batchId = req.nextUrl.searchParams.get("batchId") ?? "";
    if (!UUID.test(batchId)) return NextResponse.json({ error: "A batch id is required." }, { status: 400 });
    const { data: owned } = await db.from("email_queue").select("id").eq("batch_id", batchId).eq("event_id", ev).limit(1);
    if (!owned?.length) return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    return NextResponse.json({ summary: await batchSummary(db, batchId) });
  }

  // Recent batches, newest first. Each batch appears once, with its counts.
  const { data: rows } = await db
    .from("email_queue")
    .select("batch_id, email_type, created_at")
    .eq("event_id", ev)
    .not("email_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000)
    .returns<Array<{ batch_id: string; email_type: string; created_at: string }>>();
  const batches: Array<{ batchId: string; emailType: string; createdAt: string }> = [];
  const seen = new Set<string>();
  for (const r of rows ?? []) {
    if (seen.has(r.batch_id)) continue;
    seen.add(r.batch_id);
    batches.push({ batchId: r.batch_id, emailType: r.email_type, createdAt: r.created_at });
    if (batches.length >= 30) break;
  }
  const summaries = await Promise.all(batches.map(b => batchSummary(db, b.batchId)));
  return NextResponse.json({ batches: batches.map((b, i) => ({ ...b, summary: summaries[i] })) });
}
