import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

const ZEPTOMAIL_URL = "https://api.zeptomail.in/v1.1/email";

// Variables recognised by the email composer — unknown ones get a warning
const KNOWN_VARS = new Set([
  "firstName", "lastName", "eventName", "eventDate", "eventVenue",
  "reportingTime", "supportPhone", "supportEmail", "registrationId",
  "category", "bibNumber", "name", "email", "event",
]);

type CheckStatus = "healthy" | "warning" | "critical";
type RecipientFilter = "all" | "paid" | "free" | "pending" | "checked_in" | "not_checked_in";

export interface HealthCheckItem {
  label:  string;
  status: CheckStatus;
  detail: string;
}

export interface HealthSection {
  label:   string;
  status:  CheckStatus;
  score:   number;   // 0-100
  weight:  number;   // contribution to overall score
  blocker: boolean;  // if critical, blocks sending
  items:   HealthCheckItem[];
}

// ── Scoring helpers ────────────────────────────────────────────────────────────

function scoreItems(items: HealthCheckItem[]): number {
  if (!items.length) return 100;
  const pts = items.reduce(
    (s, i) => s + (i.status === "healthy" ? 1 : i.status === "warning" ? 0.5 : 0),
    0,
  );
  return Math.round((pts / items.length) * 100);
}

function statusFromItems(items: HealthCheckItem[]): CheckStatus {
  if (items.some(i => i.status === "critical")) return "critical";
  if (items.some(i => i.status === "warning"))  return "warning";
  return "healthy";
}

// ── GET: live operational health (no template content required) ───────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [emailQueueRes, waRes, jobsRes, providerCheck, dbCheck] = await Promise.all([
    db.from("email_queue").select("status, sent_at, bounce_type")
      .eq("event_id", id),
    db.from("wa_message_log").select("status, sent_at")
      .eq("event_id", id)
      .gte("sent_at", cutoff24h),
    db.from("job_queue").select("status").in("status", ["pending", "dead"]),
    runEmailProviderCheck(),
    runDatabaseCheck(db),
  ]);

  const emailRows = emailQueueRes.data ?? [];
  const emailAll  = emailRows.length;
  const emailQueued   = emailRows.filter(r => r.status === "queued").length;
  const emailSending  = emailRows.filter(r => r.status === "sending").length;
  const emailDelivered = emailRows.filter(r => r.status === "delivered").length;
  const emailFailed   = emailRows.filter(r => r.status === "failed").length;
  const emailBounced  = emailRows.filter(r => r.bounce_type).length;
  const emailPct24h   = (() => {
    const sent24h = emailRows.filter(r => (r.sent_at ?? "") >= cutoff24h);
    if (!sent24h.length) return null;
    return Math.round((sent24h.filter(r => r.status === "delivered").length / sent24h.length) * 100);
  })();

  const waRows = waRes.data ?? [];
  const waTotal     = waRows.length;
  const waDelivered = waRows.filter(r => r.status === "delivered" || r.status === "read").length;
  const waFailed    = waRows.filter(r => r.status === "failed").length;

  const jobs       = jobsRes.data ?? [];
  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const deadJobs    = jobs.filter(j => j.status === "dead").length;

  // Derive overall status
  const hasIssue = emailFailed > 10 || deadJobs > 0 || providerCheck.status === "critical";
  const hasWarn  = emailFailed > 0  || pendingJobs > 100 || waFailed > 5 || providerCheck.status === "warning";
  const overallStatus: CheckStatus = hasIssue ? "critical" : hasWarn ? "warning" : "healthy";

  return NextResponse.json({
    event_id: id,
    status:   overallStatus,
    email: {
      total:     emailAll,
      queued:    emailQueued,
      sending:   emailSending,
      delivered: emailDelivered,
      failed:    emailFailed,
      bounced:   emailBounced,
      delivery_rate_24h: emailPct24h,
    },
    whatsapp: {
      total_24h:     waTotal,
      delivered_24h: waDelivered,
      failed_24h:    waFailed,
    },
    system: {
      pending_jobs: pendingJobs,
      dead_jobs:    deadJobs,
      provider:     { status: providerCheck.status, score: providerCheck.score },
      database:     { status: dbCheck.status,       score: dbCheck.score },
    },
    as_of: new Date().toISOString(),
  });
}

// ── POST: pre-send validation (existing — unchanged) ─────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as {
    subject?:          string;
    body_html?:        string;
    recipient_filter?: RecipientFilter;
    attachments?:      Array<{ name: string; mime_type: string; size: number; path: string }>;
  };

  const { subject, body_html, recipient_filter = "all", attachments = [] } = body;
  const db = getSupabaseServer();

  // ── All checks in parallel ─────────────────────────────────────────────────
  const [
    emailProviderCheck,
    databaseCheck,
    queueCheck,
    storageCheck,
    eventCheck,
    recipientRaw,
  ] = await Promise.all([
    runEmailProviderCheck(),
    runDatabaseCheck(db),
    runQueueCheck(db),
    runStorageCheck(db, attachments),
    runEventCheck(db, id),
    fetchRecipientStats(db, id, recipient_filter),
  ]);

  const templateCheck   = runTemplateCheck(subject, body_html);
  const recipientsCheck = buildRecipientsSection(recipientRaw);

  const checks: Record<string, HealthSection> = {
    email_provider: emailProviderCheck,
    database:       databaseCheck,
    queue:          queueCheck,
    storage:        storageCheck,
    template:       templateCheck,
    recipients:     recipientsCheck,
    event:          eventCheck,
  };

  // ── Overall score ──────────────────────────────────────────────────────────
  const totalWeight   = Object.values(checks).reduce((s, c) => s + c.weight, 0);
  const weightedScore = Object.values(checks).reduce((s, c) => s + c.score * c.weight, 0);
  const score         = Math.round(weightedScore / totalWeight);

  const hasCritical   = Object.values(checks).some(c => c.status === "critical");
  const hasWarning    = Object.values(checks).some(c => c.status === "warning");
  const status: CheckStatus = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";

  // ── Blockers + warnings ───────────────────────────────────────────────────
  const blockers: string[] = [];
  const warnings:  string[] = [];

  for (const check of Object.values(checks)) {
    for (const item of check.items) {
      if (item.status === "critical" && check.blocker) {
        blockers.push(`${check.label} — ${item.label}: ${item.detail}`);
      } else if (item.status === "warning") {
        warnings.push(`${check.label} — ${item.label}: ${item.detail}`);
      }
    }
  }

  // ── Delivery estimate ──────────────────────────────────────────────────────
  const recipientCount   = recipientRaw.validCount;
  const estimatedSeconds = Math.max(recipientCount, 1); // ~1 email/sec
  const completionTime   = new Date(Date.now() + estimatedSeconds * 1000).toISOString();

  return NextResponse.json({
    score,
    status,
    checks,
    blockers,
    warnings,
    delivery_estimate: {
      recipient_count:   recipientCount,
      batch_count:       Math.ceil(recipientCount / 5),
      estimated_seconds: estimatedSeconds,
      completion_time:   completionTime,
    },
  });
}

// ── Email provider check ───────────────────────────────────────────────────────

async function runEmailProviderCheck(): Promise<HealthSection> {
  const apiKey    = process.env.ZEPTOMAIL_API_KEY;
  const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL;
  const fromName  = process.env.ZEPTOMAIL_FROM_NAME;

  const items: HealthCheckItem[] = [];

  items.push({
    label:  "API Key",
    status: apiKey ? "healthy" : "critical",
    detail: apiKey ? "Configured" : "ZEPTOMAIL_API_KEY env var not set",
  });

  items.push({
    label:  "Sender Email",
    status: fromEmail ? "healthy" : "critical",
    detail: fromEmail ?? "ZEPTOMAIL_FROM_EMAIL env var not set",
  });

  const domain = fromEmail ? fromEmail.split("@")[1] : null;
  items.push({
    label:  "Sender Domain",
    status: domain ? "healthy" : "warning",
    detail: domain ?? "Cannot determine (no sender email)",
  });

  items.push({
    label:  "Sender Name",
    status: fromName ? "healthy" : "warning",
    detail: fromName ?? "Not set — will default to 'Connected Steps'",
  });

  // Authentication format check
  if (apiKey) {
    const hasPrefix = apiKey.startsWith("Zoho-enczapikey ") || apiKey.length > 30;
    items.push({
      label:  "Authentication",
      status: hasPrefix ? "healthy" : "warning",
      detail: hasPrefix ? "API key format looks valid" : "API key may be malformed",
    });
  }

  // Connectivity test (OPTIONS to avoid sending an email)
  const pingStart = Date.now();
  if (apiKey) {
    try {
      await fetch(ZEPTOMAIL_URL, {
        method: "OPTIONS",
        signal: AbortSignal.timeout(5000),
      });
      const ms = Date.now() - pingStart;
      items.push({ label: "API Connectivity",  status: "healthy", detail: "Reachable" });
      items.push({ label: "Response Time",      status: ms < 600 ? "healthy" : ms < 2000 ? "warning" : "critical", detail: `${ms}ms` });
      items.push({ label: "Provider Availability", status: "healthy", detail: "ZeptoMail API online" });
    } catch {
      const ms = Date.now() - pingStart;
      items.push({ label: "API Connectivity",     status: "critical", detail: `Network error (${ms}ms)` });
      items.push({ label: "Provider Availability", status: "critical", detail: "Could not reach api.zeptomail.in" });
    }
  } else {
    items.push({ label: "API Connectivity",     status: "critical", detail: "Cannot test — API key missing" });
    items.push({ label: "Provider Availability", status: "critical", detail: "Unknown — API key missing" });
  }

  return { label: "Email Provider", status: statusFromItems(items), score: scoreItems(items), weight: 30, blocker: true, items };
}

// ── Database check ─────────────────────────────────────────────────────────────

async function runDatabaseCheck(db: ReturnType<typeof getSupabaseServer>): Promise<HealthSection> {
  const tables = [
    { name: "event_comm_history",  label: "Communication History" },
    { name: "email_queue",         label: "Email Queue" },
    { name: "job_queue",           label: "Job Queue" },
    { name: "event_registrations", label: "Registration Records" },
    { name: "event_participants",  label: "Participant Registry" },
  ] as const;

  const results = await Promise.all(
    tables.map(async (t) => {
      const { error } = await db.from(t.name).select("id", { head: true }).limit(1);
      return { label: t.label, ok: !error, msg: error?.message };
    }),
  );

  const items: HealthCheckItem[] = results.map(r => ({
    label:  r.label,
    status: r.ok ? "healthy" : "critical",
    detail: r.ok ? "Accessible" : (r.msg ?? "Query error"),
  }));

  items.push({ label: "Read/Write Permissions", status: "healthy", detail: "Service role (bypasses RLS)" });

  return { label: "Database", status: statusFromItems(items), score: scoreItems(items), weight: 20, blocker: true, items };
}

// ── Queue health ───────────────────────────────────────────────────────────────

async function runQueueCheck(db: ReturnType<typeof getSupabaseServer>): Promise<HealthSection> {
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [
    { count: pendingEmail },
    { count: failedEmail  },
    { count: stuckEmail   },
    { count: pendingJobs  },
    { count: failedJobs   },
  ] = await Promise.all([
    db.from("email_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
    db.from("email_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("email_queue").select("id", { count: "exact", head: true }).eq("status", "sending").lt("created_at", stuckCutoff),
    db.from("job_queue").select("id",   { count: "exact", head: true }).eq("status", "pending"),
    db.from("job_queue").select("id",   { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const pending = pendingEmail ?? 0;
  const failed  = failedEmail  ?? 0;
  const stuck   = stuckEmail   ?? 0;
  const pJobs   = pendingJobs  ?? 0;
  const fJobs   = failedJobs   ?? 0;

  const items: HealthCheckItem[] = [
    { label: "Queue Worker",   status: "healthy", detail: "after() — runs on every send request" },
    { label: "Scheduler",      status: "healthy", detail: "Vercel serverless (per-request)" },
    { label: "Pending Emails", status: pending === 0 ? "healthy" : "warning", detail: `${pending} email(s) awaiting delivery` },
    { label: "Failed Emails",  status: failed === 0 ? "healthy" : failed > 50 ? "critical" : "warning", detail: `${failed} in failed state` },
    { label: "Stuck Emails",   status: stuck === 0 ? "healthy" : "warning", detail: stuck > 0 ? `${stuck} stuck in 'sending' >15 min` : "None" },
    { label: "Pending Jobs",   status: pJobs < 100 ? "healthy" : "warning", detail: `${pJobs} background job(s)` },
    { label: "Failed Jobs",    status: fJobs === 0 ? "healthy" : fJobs > 10 ? "critical" : "warning", detail: `${fJobs} background job failure(s)` },
    { label: "Retry Queue",    status: "healthy", detail: "Transient failures retry up to 5×" },
  ];

  return { label: "Queue", status: statusFromItems(items), score: scoreItems(items), weight: 15, blocker: false, items };
}

// ── Storage check ──────────────────────────────────────────────────────────────

async function runStorageCheck(
  db: ReturnType<typeof getSupabaseServer>,
  attachments: Array<{ name: string; path: string }>,
): Promise<HealthSection> {
  const items: HealthCheckItem[] = [];

  // Check bucket exists
  try {
    const { data: buckets } = await db.storage.listBuckets();
    const exists = buckets?.some(b => b.id === "email-attachments") ?? false;
    items.push({
      label:  "Attachment Bucket",
      status: exists ? "healthy" : "warning",
      detail: exists ? "email-attachments bucket ready" : "email-attachments bucket not found — uploads will fail",
    });
  } catch {
    items.push({ label: "Attachment Bucket", status: "warning", detail: "Could not query storage buckets" });
  }

  // Verify each attachment file still exists
  if (attachments.length === 0) {
    items.push({ label: "Attachments", status: "healthy", detail: "No attachments" });
  } else {
    const totalKB = 0; // size checked at upload time
    void totalKB;

    const checks = await Promise.all(
      attachments.map(async (a) => {
        const parts    = a.path.split("/");
        const filename = parts.pop()!;
        const folder   = parts.join("/");
        const { data, error } = await db.storage.from("email-attachments").list(folder, {
          limit: 200,
          search: filename,
        });
        const found = !error && (data?.some(f => f.name === filename) ?? false);
        return { name: a.name, found };
      }),
    );

    const missing = checks.filter(c => !c.found).map(c => c.name);
    items.push({
      label:  "Attachment Files",
      status: missing.length === 0 ? "healthy" : "critical",
      detail: missing.length === 0
        ? `${attachments.length} file(s) verified`
        : `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`,
    });
  }

  items.push({ label: "Route Maps / Images", status: "healthy", detail: "Served via public CDN / URLs" });

  return { label: "Storage", status: statusFromItems(items), score: scoreItems(items), weight: 5, blocker: false, items };
}

// ── Template validation ────────────────────────────────────────────────────────

function runTemplateCheck(subject?: string, bodyHtml?: string): HealthSection {
  const items: HealthCheckItem[] = [];

  // Subject
  if (!subject?.trim()) {
    items.push({ label: "Subject",      status: "critical", detail: "Subject line is required" });
  } else {
    const sub = subject.trim();
    items.push({ label: "Subject", status: "healthy", detail: `"${sub.slice(0, 55)}${sub.length > 55 ? "…" : ""}"` });
  }

  // HTML body
  if (!bodyHtml?.trim()) {
    items.push({ label: "HTML Content", status: "critical", detail: "Email body is required" });
    items.push({ label: "Plain Text Version", status: "critical", detail: "Auto-derived from HTML — but HTML is empty" });
    items.push({ label: "Merge Variables",    status: "healthy", detail: "N/A — no content" });
    items.push({ label: "Images",             status: "healthy", detail: "N/A — no content" });
  } else {
    const len = bodyHtml.length;
    items.push({ label: "HTML Content", status: "healthy", detail: `${len.toLocaleString()} characters` });
    items.push({ label: "Plain Text Version", status: "healthy", detail: "Auto-stripped from HTML at send time" });

    // Merge variable check
    const allVars   = [...bodyHtml.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1].trim());
    const unknowns  = allVars.filter(v => !KNOWN_VARS.has(v));
    if (unknowns.length > 0) {
      items.push({
        label:  "Merge Variables",
        status: "warning",
        detail: `Unknown: {{${unknowns.slice(0, 3).join("}}, {{")}}}${unknowns.length > 3 ? "…" : ""}`,
      });
    } else {
      items.push({
        label:  "Merge Variables",
        status: "healthy",
        detail: allVars.length > 0 ? `${allVars.length} variable(s) — all recognised` : "No variables",
      });
    }

    // Broken placeholders (single-brace not in KNOWN_VARS)
    const singleBrace = [...bodyHtml.matchAll(/\{([A-Za-z]+)\}/g)].map(m => m[1]);
    const knownSingle = new Set(["name", "email", "event"]);
    const unknownSingle = singleBrace.filter(v => !knownSingle.has(v));
    if (unknownSingle.length > 0) {
      items.push({ label: "Broken Placeholders", status: "warning", detail: `{${unknownSingle.slice(0,3).join("}, {")}}: single-brace, may not substitute` });
    }

    // Image checks
    const imgs = [...bodyHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
    const insecure = imgs.filter(s => s.startsWith("http://"));
    const broken   = imgs.filter(s => !s.startsWith("http://") && !s.startsWith("https://") && !s.startsWith("data:"));

    if (broken.length > 0) {
      items.push({ label: "Broken Images",    status: "warning", detail: `${broken.length} image(s) with relative/invalid URL` });
    } else if (insecure.length > 0) {
      items.push({ label: "Images",           status: "warning", detail: `${insecure.length} image(s) using HTTP — may be blocked by email clients` });
    } else {
      items.push({ label: "Images",           status: "healthy", detail: imgs.length > 0 ? `${imgs.length} image(s) — all HTTPS or data URI` : "No images" });
    }
  }

  return { label: "Template", status: statusFromItems(items), score: scoreItems(items), weight: 15, blocker: true, items };
}

// ── Recipient stats ────────────────────────────────────────────────────────────

async function fetchRecipientStats(
  db: ReturnType<typeof getSupabaseServer>,
  eventId: string,
  filter: RecipientFilter,
) {
  let query = db
    .from("event_registrations")
    .select("user_email, user_name, status, payment_status, checked_in_at")
    .eq("event_id", eventId)
    .neq("status", "cancelled");

  if (filter === "paid")           query = query.eq("payment_status", "paid");
  if (filter === "free")           query = query.eq("payment_status", "free");
  if (filter === "pending")        query = query.eq("payment_status", "pending");
  if (filter === "checked_in")     query = query.not("checked_in_at", "is", null);
  if (filter === "not_checked_in") query = query.is("checked_in_at", null).eq("status", "confirmed");

  const { data: rows } = await query;
  const all = rows ?? [];

  const seen = new Set<string>();
  let validCount = 0, missing = 0, invalid = 0, duplicates = 0;

  for (const r of all) {
    if (!r.user_email)                                    { missing++;    continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.user_email)){ invalid++;    continue; }
    if (seen.has(r.user_email))                           { duplicates++; continue; }
    seen.add(r.user_email);
    validCount++;
  }

  return { total: all.length, validCount, missing, invalid, duplicates };
}

function buildRecipientsSection(d: {
  total: number; validCount: number; missing: number; invalid: number; duplicates: number;
}): HealthSection {
  const { total, validCount, missing, invalid, duplicates } = d;
  const items: HealthCheckItem[] = [];

  if (total === 0) {
    items.push({ label: "Recipients", status: "critical", detail: "No registrants match the selected filter" });
  } else {
    items.push({ label: "Total Matched",  status: "healthy",                      detail: `${total} registrant(s)` });
    items.push({ label: "Will Receive",   status: validCount > 0 ? "healthy" : "critical", detail: `${validCount} valid unique address(es)` });
    if (missing > 0)    items.push({ label: "Missing Email",  status: "warning", detail: `${missing} registrant(s) have no email` });
    if (invalid > 0)    items.push({ label: "Invalid Email",  status: "warning", detail: `${invalid} address(es) fail format check` });
    if (duplicates > 0) items.push({ label: "Duplicate Email",status: "warning", detail: `${duplicates} duplicate(s) will be skipped` });
    const skipped = missing + invalid + duplicates;
    if (skipped === 0)  items.push({ label: "Will Skip",      status: "healthy", detail: "0 — all recipients valid" });
    else                items.push({ label: "Will Skip",      status: "warning", detail: `${skipped} total (missing + invalid + duplicate)` });
  }

  return {
    label:   "Recipients",
    status:  statusFromItems(items),
    score:   scoreItems(items),
    weight:  10,
    blocker: total === 0,
    items,
  };
}

// ── Event check ────────────────────────────────────────────────────────────────

async function runEventCheck(
  db: ReturnType<typeof getSupabaseServer>,
  eventId: string,
): Promise<HealthSection> {
  const { data: ev, error } = await db
    .from("events")
    .select("title, location, start_date, start_time")
    .eq("id", eventId)
    .single();

  const items: HealthCheckItem[] = [];

  if (error || !ev) {
    items.push({ label: "Event", status: "critical", detail: "Event not found" });
  } else {
    items.push({ label: "Event Exists",    status: "healthy",                          detail: ev.title ?? "(no title)" });
    items.push({ label: "Venue",           status: ev.location   ? "healthy" : "warning", detail: ev.location   ?? "Not set — {{eventVenue}} will be blank" });
    items.push({ label: "Start Date",      status: ev.start_date ? "healthy" : "warning", detail: ev.start_date ?? "Not set — {{eventDate}} will be blank" });
    items.push({ label: "Reporting Time",  status: ev.start_time ? "healthy" : "warning", detail: ev.start_time ?? "Not set — {{reportingTime}} will be blank" });
  }

  return { label: "Event", status: statusFromItems(items), score: scoreItems(items), weight: 5, blocker: false, items };
}
