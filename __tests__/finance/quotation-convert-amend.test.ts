/**
 * Quotation → invoice conversion and invoice amendments. A fake database records every query, so the tests check the rules
 * themselves: only accepted quotations convert, the quotation is claimed before the invoice is created, a failure undoes
 * the claim and the new invoice, and an amendment never changes the original.
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

type Op = { table: string; op: string; payload?: Record<string, unknown>; filters: Array<[string, unknown]> };

let ops: Op[] = [];
let resolver: (o: Op) => { data?: unknown; error?: unknown } = () => ({ data: null, error: null });

function mockMake(table: string) {
  const o: Op = { table, op: "select", filters: [] };
  const run = () => { ops.push({ ...o, filters: [...o.filters] }); return resolver({ ...o, filters: [...o.filters] }); };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "neq", "is", "gte", "lte", "in", "not", "or", "order", "limit", "returns"]) {
    b[m] = () => b;
  }
  b.eq = (k: string, v: unknown) => { o.filters.push([k, v]); return b; };
  b.insert = (p: Record<string, unknown>) => { o.op = "insert"; o.payload = p; return b; };
  b.update = (p: Record<string, unknown>) => { o.op = "update"; o.payload = p; return b; };
  b.delete = () => { o.op = "delete"; return b; };
  b.maybeSingle = () => Promise.resolve(run());
  b.single = () => Promise.resolve(run());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
  return b;
}

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => ({ from: (t: string) => mockMake(t) }) }));
jest.mock("@/lib/admin-auth", () => ({ isAdmin: () => mockIsAdmin.current }));

const mockIsAdmin = { current: true };

import { POST as convert } from "@/app/api/admin/quotations/[id]/convert/route";
import { POST as amend } from "@/app/api/admin/manual-invoices/[id]/amend/route";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const req = (url: string) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const quotation = { id: "q1", status: "accepted", company_name: "Acme", client_name: "Asha", grand_total: 1180, subtotal: 1000,
  discount_amount: 0, taxable_amount: 1000, cgst_amount: 90, sgst_amount: 90, igst_amount: 0, round_off: 0 };

function setup(cfg: {
  claimed?: unknown; current?: unknown; items?: unknown[]; invoiceError?: unknown; itemsError?: unknown;
  src?: unknown; srcItems?: unknown[]; openRevision?: unknown; revisionError?: unknown;
}) {
  resolver = (o) => {
    if (o.table === "quotations" && o.op === "update" && o.filters.some(([k, v]) => k === "status" && v === "accepted")) {
      return { data: cfg.claimed ?? null, error: null };
    }
    if (o.table === "quotations" && o.op === "select") return { data: cfg.current ?? null, error: null };
    if (o.table === "quotation_items") return { data: cfg.items ?? [], error: null };
    if (o.table === "manual_invoices" && o.op === "insert") {
      return cfg.invoiceError ? { data: null, error: cfg.invoiceError } : { data: { id: "inv1", invoice_number: "CS/INV/2026/001", ...(o.payload ?? {}) }, error: null };
    }
    if (o.table === "manual_invoice_items" && o.op === "insert") return { data: null, error: cfg.itemsError ?? null };
    if (o.table === "manual_invoices" && o.op === "select" && o.filters.some(([k]) => k === "id")) {
      return { data: cfg.src ?? null, error: null };
    }
    if (o.table === "manual_invoices" && o.op === "select" && o.filters.some(([k]) => k === "amends_invoice_id")) {
      return { data: cfg.openRevision ?? null, error: null };
    }
    if (o.table === "manual_invoice_items" && o.op === "select") return { data: cfg.srcItems ?? [], error: null };
    if (o.table === "manual_invoices" && o.op === "insert" && cfg.revisionError) return { data: null, error: cfg.revisionError };
    return { data: null, error: null };
  };
}

beforeEach(() => { ops = []; mockIsAdmin.current = true; });

describe("converting a quotation", () => {
  it("refuses a caller who is not an admin", async () => {
    mockIsAdmin.current = false;
    const res = await convert(req("http://t/x"), ctx("q1"));
    expect(res.status).toBe(401);
    expect(ops).toHaveLength(0);
  });

  it("only an accepted quotation converts: a draft is refused and no invoice is created", async () => {
    setup({ claimed: null, current: { status: "draft", converted_invoice_id: null } });
    const res = await convert(req("http://t/x"), ctx("q1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/accepted/);
    expect(ops.some(o => o.table === "manual_invoices" && o.op === "insert")).toBe(false);
  });

  it("a quotation that has already converted returns the invoice it was converted to", async () => {
    setup({ claimed: null, current: { status: "converted", converted_invoice_id: "inv9" } });
    const res = await convert(req("http://t/x"), ctx("q1"));
    expect(res.status).toBe(409);
    expect((await res.json()).invoice_id).toBe("inv9");
  });

  it("claims the quotation before creating the invoice, and creates the invoice as a draft", async () => {
    setup({ claimed: quotation, items: [{ description: "Race kit", quantity: 1, rate: 1000, gst_pct: 18, amount: 1000, sort_order: 0 }] });
    const res = await convert(req("http://t/x"), ctx("q1"));
    expect(res.status).toBe(201);
    const claimIndex = ops.findIndex(o => o.table === "quotations" && o.op === "update");
    const insertIndex = ops.findIndex(o => o.table === "manual_invoices" && o.op === "insert");
    expect(claimIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(claimIndex);
    const invoice = ops[insertIndex].payload!;
    expect(invoice.payment_status).toBe("draft");
    expect(invoice.source_quotation_id).toBe("q1");
    expect(invoice.grand_total).toBe(1180);
  });

  it("if the invoice cannot be created, the quotation goes back to accepted and nothing is left behind", async () => {
    setup({ claimed: quotation, invoiceError: { message: "boom" } });
    const res = await convert(req("http://t/x"), ctx("q1"));
    expect(res.status).toBe(500);
    const released = ops.some(o => o.table === "quotations" && o.op === "update" && o.payload?.status === "accepted");
    expect(released).toBe(true);
  });

  it("if the items cannot be copied, the new invoice is deleted and the quotation goes back to accepted", async () => {
    setup({ claimed: quotation, items: [{ description: "x", quantity: 1, rate: 1, gst_pct: 0, amount: 1, sort_order: 0 }], itemsError: { message: "boom" } });
    const res = await convert(req("http://t/x"), ctx("q1"));
    expect(res.status).toBe(500);
    expect(ops.some(o => o.table === "manual_invoices" && o.op === "delete")).toBe(true);
    expect(ops.some(o => o.table === "quotations" && o.op === "update" && o.payload?.status === "accepted")).toBe(true);
  });
});

describe("amending an invoice", () => {
  const sent = { id: "inv1", invoice_number: "CS/INV/2026/001", payment_status: "sent", grand_total: 1180, revision_no: 0, due_date: "2026-12-01" };

  it("a draft is edited directly, not amended", async () => {
    setup({ src: { ...sent, payment_status: "draft" } });
    const res = await amend(req("http://t/x"), ctx("inv1"));
    expect(res.status).toBe(409);
  });

  it("a paid or cancelled invoice can't be amended here", async () => {
    setup({ src: { ...sent, payment_status: "paid" } });
    expect((await amend(req("http://t/x"), ctx("inv1"))).status).toBe(409);
    setup({ src: { ...sent, payment_status: "cancelled" } });
    expect((await amend(req("http://t/x"), ctx("inv1"))).status).toBe(409);
  });

  it("only one revision can be open for an invoice at a time", async () => {
    setup({ src: sent, openRevision: { id: "rev0", invoice_number: "CS/INV/2026/002" } });
    const res = await amend(req("http://t/x"), ctx("inv1"));
    expect(res.status).toBe(409);
    expect((await res.json()).invoice_id).toBe("rev0");
  });

  it("creates a new draft linked to the original, with the next revision number", async () => {
    setup({ src: sent, srcItems: [] });
    const res = await amend(req("http://t/x"), ctx("inv1"));
    expect(res.status).toBe(201);
    const revision = ops.find(o => o.table === "manual_invoices" && o.op === "insert")!.payload!;
    expect(revision.payment_status).toBe("draft");
    expect(revision.amends_invoice_id).toBe("inv1");
    expect(revision.revision_no).toBe(1);
    expect(revision.invoice_number).toBeUndefined();
  });

  it("never updates the original invoice", async () => {
    setup({ src: sent, srcItems: [] });
    await amend(req("http://t/x"), ctx("inv1"));
    const touchesOriginal = ops.some(o => o.table === "manual_invoices" && o.op === "update");
    expect(touchesOriginal).toBe(false);
  });

  it("does not copy the quotation link into the revision", async () => {
    setup({ src: { ...sent, source_quotation_id: "q1" }, srcItems: [] });
    await amend(req("http://t/x"), ctx("inv1"));
    const revision = ops.find(o => o.table === "manual_invoices" && o.op === "insert")!.payload!;
    expect(revision.source_quotation_id).toBeUndefined();
  });
});

describe("the other invoice routes keep the new links separate", () => {
  it("duplicating an invoice does not copy its quotation or revision links", () => {
    const dup = read("app/api/admin/manual-invoices/[id]/duplicate/route.ts");
    expect(dup).toMatch(/source_quotation_id: _sq/);
    expect(dup).toMatch(/amends_invoice_id: _am/);
  });

  it("the invoice page offers Revise only for sent invoices", () => {
    const page = read("app/admin/finance/manual-invoices/[id]/page.tsx");
    expect(page).toMatch(/\["sent", "viewed", "partially_paid", "overdue"\]\.includes\(invoice\.payment_status\)/);
  });
});
