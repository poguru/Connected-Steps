import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees } from "@/lib/finance-service";

type ReportType =
  | "registrations"
  | "refunds"
  | "coupons"
  | "invoices"
  | "memberships"
  | "merchandise"
  | "donations"
  | "sponsors"
  | "payouts"
  | "manual_payments";

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape  = (v: unknown) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(",")),
  ].join("\r\n");
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const report    = (searchParams.get("report") ?? "registrations") as ReportType;
  const org_id    = searchParams.get("org_id")    ?? undefined;
  const event_id  = searchParams.get("event_id")  ?? undefined;
  const date_from = searchParams.get("date_from") ?? undefined;
  const date_to   = searchParams.get("date_to")   ?? undefined;
  const format    = searchParams.get("format")    ?? "csv";

  const db = getSupabaseServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];

  // All query builders use `any` to sidestep Supabase's deeply-nested generics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyDates = (q: any, col = "created_at"): any => {
    if (date_from) q = q.gte(col, date_from);
    if (date_to)   q = q.lte(col, date_to + "T23:59:59Z");
    return q;
  };

  switch (report) {
    case "registrations": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("event_registrations").select(`
        registration_code, user_name, user_email, user_phone,
        event_id, distance_category, final_price, original_price,
        coupon_discount, coupon_code, payment_status, status,
        razorpay_payment_id, razorpay_order_id, created_at,
        events!inner(title, organization_id)
      `).eq("payment_status", "paid");
      if (event_id) q = q.eq("event_id", event_id);
      if (org_id)   q = q.eq("events.organization_id", org_id);
      q = applyDates(q);
      const { data: d1 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d1 ?? []).map((r: Record<string, unknown>) => ({
        code:           r.registration_code,
        name:           r.user_name,
        email:          r.user_email,
        phone:          r.user_phone,
        event:          (r.events as { title?: string } | null)?.title ?? "",
        category:       r.distance_category,
        amount_paid:    r.final_price,
        original_price: r.original_price,
        coupon_discount:r.coupon_discount,
        coupon_code:    r.coupon_code,
        payment_id:     r.razorpay_payment_id,
        order_id:       r.razorpay_order_id,
        status:         r.status,
        date:           String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "refunds": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("event_registrations").select(`
        registration_code, user_name, user_email,
        final_price, refund_amount, refund_status, refund_reason,
        razorpay_refund_id, refunded_at, created_at,
        events(title)
      `).in("refund_status", ["refunded", "partial_refund"]);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q, "refunded_at");
      const { data: d2 } = await q.order("refunded_at", { ascending: false }).limit(5000);
      rows = (d2 ?? []).map((r: Record<string, unknown>) => ({
        code:          r.registration_code,
        name:          r.user_name,
        email:         r.user_email,
        event:         (r.events as { title?: string } | null)?.title ?? "",
        original_paid: r.final_price,
        refund_amount: r.refund_amount,
        refund_status: r.refund_status,
        refund_reason: r.refund_reason,
        refund_id:     r.razorpay_refund_id,
        refunded_at:   String(r.refunded_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "coupons": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("coupons").select(`
        code, coupon_type, discount_type, discount_value, max_uses, uses_count,
        event_id, is_active, expires_at, created_at, events(title)
      `);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q);
      const { data: d3 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d3 ?? []).map((r: Record<string, unknown>) => ({
        code:           r.code,
        type:           r.coupon_type,
        discount_type:  r.discount_type,
        discount_value: r.discount_value,
        max_uses:       r.max_uses,
        uses_count:     r.uses_count,
        event:          (r.events as { title?: string } | null)?.title ?? "All events",
        is_active:      r.is_active,
        expires_at:     String(r.expires_at ?? "").slice(0, 10),
        created_at:     String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "invoices": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("invoices").select("invoice_number, user_name, user_email, product_name, product_type, total_amount, invoice_status, email_sent, created_at");
      if (org_id) q = q.eq("organization_id", org_id);
      q = applyDates(q);
      const { data: d4 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d4 ?? []).map((r: Record<string, unknown>) => ({
        invoice_number: r.invoice_number,
        name:           r.user_name,
        email:          r.user_email,
        product:        r.product_name,
        type:           r.product_type,
        amount_rupees:  r.total_amount,
        status:         r.invoice_status,
        email_sent:     r.email_sent,
        date:           String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "memberships": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("memberships").select("user_email, plan_name, amount_paid, payment_status, razorpay_subscription_id, start_date, end_date, created_at");
      q = applyDates(q);
      const { data: d5 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d5 ?? []).map((r: Record<string, unknown>) => ({
        email:           r.user_email,
        plan:            r.plan_name,
        amount_paid:     r.amount_paid,
        status:          r.payment_status,
        subscription_id: r.razorpay_subscription_id,
        start_date:      String(r.start_date ?? "").slice(0, 10),
        end_date:        String(r.end_date   ?? "").slice(0, 10),
        created_at:      String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "merchandise": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("merchandise_orders").select("id, user_name, user_email, user_phone, total_paise, gst_paise, status, payment_status, fulfillment_type, created_at");
      if (org_id)   q = q.eq("organization_id", org_id);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q);
      const { data: d6 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d6 ?? []).map((r: Record<string, unknown>) => ({
        order_id:     String(r.id ?? "").slice(0, 8),
        name:         r.user_name,
        email:        r.user_email,
        phone:        r.user_phone,
        total_rupees: paiseToRupees(Number(r.total_paise ?? 0)),
        gst_rupees:   paiseToRupees(Number(r.gst_paise   ?? 0)),
        status:       r.status,
        payment:      r.payment_status,
        fulfillment:  r.fulfillment_type,
        date:         String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "donations": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("donations").select("user_name, user_email, amount_paise, campaign, beneficiary, payment_method, tax_receipt_number, tax_receipt_sent, created_at");
      if (org_id)   q = q.eq("organization_id", org_id);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q);
      const { data: d7 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d7 ?? []).map((r: Record<string, unknown>) => ({
        name:           r.user_name,
        email:          r.user_email,
        amount_rupees:  paiseToRupees(Number(r.amount_paise ?? 0)),
        campaign:       r.campaign,
        beneficiary:    r.beneficiary,
        payment_method: r.payment_method,
        receipt_number: r.tax_receipt_number,
        receipt_sent:   r.tax_receipt_sent,
        date:           String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "sponsors": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("sponsor_agreements").select("sponsor_name, contact_email, agreed_amount_paise, amount_received_paise, payment_status, agreement_date, due_date, created_at, events(title)");
      if (org_id)   q = q.eq("organization_id", org_id);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q);
      const { data: d8 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d8 ?? []).map((r: Record<string, unknown>) => {
        const agreed   = Number(r.agreed_amount_paise   ?? 0);
        const received = Number(r.amount_received_paise ?? 0);
        return {
          sponsor:         r.sponsor_name,
          email:           r.contact_email,
          event:           (r.events as { title?: string } | null)?.title ?? "",
          agreed_rupees:   paiseToRupees(agreed),
          received_rupees: paiseToRupees(received),
          outstanding:     paiseToRupees(agreed - received),
          status:          r.payment_status,
          agreement_date:  r.agreement_date,
          due_date:        r.due_date,
        };
      });
      break;
    }

    case "payouts": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("payouts").select("payee_name, payee_email, payee_type, category, amount_paise, description, payment_method, status, payment_date, paid_by, created_at, events(title)");
      if (org_id)   q = q.eq("organization_id", org_id);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q);
      const { data: d9 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d9 ?? []).map((r: Record<string, unknown>) => ({
        payee:        r.payee_name,
        email:        r.payee_email,
        type:         r.payee_type,
        category:     r.category,
        amount_rupees:paiseToRupees(Number(r.amount_paise ?? 0)),
        description:  r.description,
        method:       r.payment_method,
        status:       r.status,
        payment_date: r.payment_date,
        paid_by:      r.paid_by,
        event:        (r.events as { title?: string } | null)?.title ?? "",
        created_at:   String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    case "manual_payments": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from("manual_payment_records").select("user_name, user_email, entity_type, amount_paise, payment_method, payment_reference, payment_date, recorded_by, verified, notes, created_at");
      if (org_id)   q = q.eq("organization_id", org_id);
      if (event_id) q = q.eq("event_id", event_id);
      q = applyDates(q);
      const { data: d10 } = await q.order("created_at", { ascending: false }).limit(5000);
      rows = (d10 ?? []).map((r: Record<string, unknown>) => ({
        name:          r.user_name,
        email:         r.user_email,
        entity_type:   r.entity_type,
        amount_rupees: paiseToRupees(Number(r.amount_paise ?? 0)),
        method:        r.payment_method,
        reference:     r.payment_reference,
        payment_date:  r.payment_date,
        recorded_by:   r.recorded_by,
        verified:      r.verified,
        notes:         r.notes,
        created_at:    String(r.created_at ?? "").slice(0, 10),
      }));
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  if (format === "json") {
    return NextResponse.json({ report, rows, count: rows.length });
  }

  const csv      = toCSV(rows);
  const filename = `cs-${report}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
