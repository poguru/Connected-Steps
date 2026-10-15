/**
 * IT Run email campaigns: who is selected, what is queued once, what counts as sent, and what is retried.
 * Sending is replaced by a fake; nothing reaches a provider.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the in-memory queue is intentionally loosely typed */

import {
  selectRecipients, queueBatch, processBatch, requeueRetryable, batchSummary, safeFailureText, MAX_ATTEMPTS,
  type EventRunnerRow,
} from "@/lib/it-run-email-campaign";

const BATCH = "9b1c1f0e-6d2a-4f3b-9a51-2f0c7d8e1a11";
const SOLO = "cat-solo";
const KID = "cat-kid";

function runner(over: Partial<EventRunnerRow> & { id: string }): EventRunnerRow {
  return {
    event_id: "11111111-1111-4111-8111-111111111111", registration_id: `reg-${over.id}`, first_name: "Asha", last_name: "Rao", email: `${over.id}@example.com`,
    category_id: SOLO, registration_category_id: SOLO, payment_status: "paid", registration_status: "active",
    created_at: "2026-10-10T08:00:00Z", ...over,
  };
}

describe("selectRecipients", () => {
  const rows = [
    runner({ id: "a", category_id: SOLO }),
    runner({ id: "b", category_id: KID, email: "B@Example.com" }),
    runner({ id: "c", category_id: KID, payment_status: "pending" }),
    runner({ id: "d", category_id: KID, registration_status: "cancelled" }),
    runner({ id: "e", category_id: KID, email: "not-an-email" }),
    runner({ id: "f", category_id: SOLO, email: "a@example.com" }),
    runner({ id: "g", category_id: SOLO, created_at: "2026-11-02T10:00:00Z" }),
  ];

  it("selects every eligible runner when no filter is given, skipping cancelled and invalid addresses", () => {
    const s = selectRecipients(rows, {});
    expect(s.recipients.map(r => r.participantId)).toEqual(["a", "b", "c", "g"]);
    expect(s.excludedInvalid).toBe(1);
  });

  it("targets only the chosen category", () => {
    const s = selectRecipients(rows, { categoryIds: [KID] });
    expect(s.recipients.map(r => r.participantId)).toEqual(["b", "c"]);
  });

  it("filters by payment status and by registration date", () => {
    expect(selectRecipients(rows, { paymentStatuses: ["paid"] }).recipients.map(r => r.participantId)).toEqual(["a", "b", "g"]);
    expect(selectRecipients(rows, { registeredFrom: "2026-11-01" }).recipients.map(r => r.participantId)).toEqual(["g"]);
  });

  it("removes a second runner with the same address, and lower-cases addresses", () => {
    const s = selectRecipients(rows, {});
    expect(s.excludedDuplicate).toBe(1); // "a@example.com" twice (a and f)
    expect(s.recipients.find(r => r.participantId === "b")!.email).toBe("b@example.com");
  });

  it("uses only the runners asked for by hand", () => {
    expect(selectRecipients(rows, { participantIds: ["c", "zzz"] }).recipients.map(r => r.participantId)).toEqual(["c"]);
  });
});

describe("safeFailureText", () => {
  it("removes addresses and keeps the text short", () => {
    expect(safeFailureText("rejected asha@example.com as invalid")).toBe("rejected [address] as invalid");
    expect(safeFailureText("x".repeat(500)).length).toBe(200);
    expect(safeFailureText(undefined)).toBe("unknown error");
  });
});

// ── An in-memory email_queue with the few operations the campaign code uses ──────────────────────────────

function queueDb(initial: any[] = []) {
  const rows: any[] = initial.map(r => ({ ...r }));
  let uniqueKeys = new Set(rows.map(r => `${r.batch_id}|${r.recipient_email}|${r.participant_id}`));
  const db = {
    rows,
    from(table: string) {
      if (table !== "email_queue") throw new Error("unexpected table " + table);
      const filters: Array<(r: any) => boolean> = [];
      let op: "select" | "update" | "insert" = "select";
      let patch: any = null;
      let insertRows: any[] = [];
      let limit = Infinity;
      const b: any = {};
      b.select = () => b;
      b.order = () => b;
      b.returns = () => b;
      b.eq = (k: string, v: any) => { filters.push(r => r[k] === v); return b; };
      b.not = (k: string) => { filters.push(r => r[k] !== null && r[k] !== undefined); return b; };
      b.lt = (k: string, v: any) => { filters.push(r => r[k] < v); return b; };
      b.limit = (n: number) => { limit = n; return b; };
      b.or = (expr: string) => {
        // Only the form the retry query uses: "is_permanent.is.null,is_permanent.eq.false"
        filters.push(r => r.is_permanent === null || r.is_permanent === undefined || r.is_permanent === false);
        if (!expr.includes("is_permanent")) throw new Error("unsupported or()");
        return b;
      };
      b.update = (p: any) => { op = "update"; patch = p; return b; };
      b.insert = (list: any[]) => {
        op = "insert";
        insertRows = list;
        return b;
      };
      const run = () => {
        const matched = rows.filter(r => filters.every(f => f(r)));
        if (op === "update") {
          for (const r of matched) Object.assign(r, patch);
          return { data: matched.slice(0, limit).map(r => ({ id: r.id })), error: null };
        }
        if (op === "insert") {
          const keys = insertRows.map(r => `${r.batch_id}|${r.recipient_email}|${r.participant_id}`);
          if (keys.some(k => uniqueKeys.has(k)) || new Set(keys).size !== keys.length) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          insertRows.forEach((r, i) => rows.push({ id: `row-${rows.length + 1}`, status: "queued", attempts: 0, created_at: "2026-10-20T00:00:00Z", ...r }));
          keys.forEach(k => uniqueKeys.add(k));
          return { data: null, error: null };
        }
        return { data: matched.slice(0, limit), error: null };
      };
      b.then = (res: any, rej?: any) => Promise.resolve(run()).then(res, rej);
      b.maybeSingle = () => Promise.resolve(run());
      return b;
    },
  };
  return db;
}

const EVENT = "11111111-1111-4111-8111-111111111111";

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    id, batch_id: BATCH, event_id: EVENT, recipient_email: `${id}@example.com`, recipient_name: "Asha",
    subject: "Venue change", html_body: "<p>Hi</p>", status: "queued", attempts: 0, email_type: "event_update",
    participant_id: `p-${id}`, registration_id: `r-${id}`, is_permanent: null, created_at: "2026-10-20T00:00:00Z", ...over,
  };
}

const sendOk = (id: string) => async () => ({ to: "", channel: "email", ok: true, messageId: `msg-${id}`, provider: "zeptomail", httpStatus: 200 });

describe("processBatch: accepted is not delivered", () => {
  it("marks a row accepted with the provider's message id, and clears its content", async () => {
    const db = queueDb([item("a")]);
    const send = jest.fn(async () => ({ to: "", channel: "email", ok: true, messageId: "req-123", provider: "zeptomail", httpStatus: 200 }));
    const result = await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(result).toEqual({ attempted: 1, accepted: 1, failed: 0 });
    expect(db.rows[0].status).toBe("accepted");
    expect(db.rows[0].aws_message_id).toBe("req-123");
    expect(db.rows[0].html_body).toBeNull();
    expect(db.rows[0].status).not.toBe("delivered");
  });

  it("does not count a send with no provider message id as accepted", async () => {
    const db = queueDb([item("a")]);
    const send = jest.fn(async () => ({ to: "", channel: "email", ok: true }));
    const result = await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(result.accepted).toBe(0);
    expect(db.rows[0].status).toBe("failed");
    expect(db.rows[0].failure_code).toBe("no_provider_id");
  });

  it("never sends a row that was already accepted", async () => {
    const db = queueDb([item("a"), item("b", { status: "accepted", aws_message_id: "old" })]);
    const send = jest.fn<any, any[]>(sendOk("a") as any);
    await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("a@example.com");
  });
});

describe("processBatch: failures and retries", () => {
  it("records a bad address as a permanent failure, which is never retried", async () => {
    const db = queueDb([item("a")]);
    const send = jest.fn(async () => ({ to: "", channel: "email", ok: false, error: "invalid recipient", httpStatus: 422 }));
    await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(db.rows[0]).toMatchObject({ status: "failed", is_permanent: true, failure_code: "http_422" });
    expect(await requeueRetryable(db as any, BATCH)).toBe(0);
  });

  it("retries a temporary failure, and stops at the attempt limit", async () => {
    const db = queueDb([item("a")]);
    const send = jest.fn(async () => ({ to: "", channel: "email", ok: false, error: "timeout", httpStatus: 503 }));
    await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(await requeueRetryable(db as any, BATCH)).toBe(1);
    expect(db.rows[0].status).toBe("queued");

    // Keep failing until the limit
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
      await requeueRetryable(db as any, BATCH);
    }
    await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(db.rows[0].attempts).toBe(MAX_ATTEMPTS);
    expect(await requeueRetryable(db as any, BATCH)).toBe(0);
  });

  it("retries only the failed recipients, never the accepted ones", async () => {
    const db = queueDb([item("a"), item("b")]);
    let n = 0;
    const send = jest.fn(async () => (++n === 1
      ? { to: "", channel: "email", ok: true, messageId: "m1" }
      : { to: "", channel: "email", ok: false, error: "timeout", httpStatus: 503 }));
    await processBatch(db as any, BATCH, { delayMs: 0, send: send as any });
    expect(await requeueRetryable(db as any, BATCH)).toBe(1);
    const retry = db.rows.find(r => r.status === "queued")!;
    expect(retry.recipient_email).toBe("b@example.com");
    expect(db.rows.find(r => r.recipient_email === "a@example.com")!.status).toBe("accepted");
  });
});

describe("queueBatch: a repeated submit does not queue twice", () => {
  const recipients = [{ email: "a@example.com", name: "Asha", registrationId: "r-a", participantId: "p-a", html: "<p>x</p>" }];

  it("queues the batch once and reports it as already queued on a repeat", async () => {
    const db = queueDb([]);
    const first = await queueBatch(db as any, { batchId: BATCH, eventId: EVENT, emailType: "event_update", subject: "Hi", recipients, createdBy: "admin@x" });
    const again = await queueBatch(db as any, { batchId: BATCH, eventId: EVENT, emailType: "event_update", subject: "Hi", recipients, createdBy: "admin@x" });
    expect(first.status).toBe("queued");
    expect(again.status).toBe("already_queued");
    expect(db.rows).toHaveLength(1);
  });

  it("refuses a batch id that is not a UUID", async () => {
    await expect(queueBatch(queueDb([]) as any, { batchId: "nope", eventId: EVENT, emailType: "event_update", subject: "Hi", recipients, createdBy: "a" }))
      .rejects.toThrow("invalid batch id");
  });
});

describe("batchSummary", () => {
  it("counts each status and holds no addresses", async () => {
    const db = queueDb([item("a", { status: "accepted" }), item("b", { status: "failed", is_permanent: false, attempts: 1 }), item("c", { status: "failed", is_permanent: true })]);
    const s = await batchSummary(db as any, BATCH);
    expect(s).toMatchObject({ total: 3, accepted: 1, failed: 2, retryable: 1, delivered: 0 });
    expect(JSON.stringify(s)).not.toContain("@example.com");
  });
});
