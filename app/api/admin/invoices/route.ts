import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { createAndSendInvoice } from "@/lib/invoice-service";

// GET /api/admin/invoices — list all invoices with search/filter
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const sp  = req.nextUrl.searchParams;
  const q   = sp.get("q")?.trim() ?? "";
  const type = sp.get("type") ?? "";
  const status = sp.get("status") ?? "";
  const from = sp.get("from") ?? "";
  const to   = sp.get("to")   ?? "";

  let query = db
    .from("invoices")
    .select("id, invoice_number, user_name, user_email, product_name, product_type, subtotal, gst_amount, total_amount, invoice_status, email_sent, email_sent_at, email_error, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`invoice_number.ilike.%${q}%,user_email.ilike.%${q}%,user_name.ilike.%${q}%,payment_id.ilike.%${q}%,product_name.ilike.%${q}%`);
  }
  if (type)   query = query.eq("product_type", type);
  if (status) query = query.eq("invoice_status", status);
  if (from)   query = query.gte("created_at", from);
  if (to)     query = query.lte("created_at", to + "T23:59:59Z");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invoices = data ?? [];
  const summary = {
    total:       invoices.length,
    totalAmount: invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0),
    totalGST:    invoices.reduce((s, i) => s + (i.gst_amount   ?? 0), 0),
    emailSent:   invoices.filter(i => i.email_sent).length,
    emailFailed: invoices.filter(i => !i.email_sent && i.email_error).length,
  };

  return NextResponse.json({ invoices, summary });
}

// POST /api/admin/invoices — manually generate invoice for a registration/membership
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const inv  = await createAndSendInvoice(body);
  if (!inv) return NextResponse.json({ error: "Failed to generate invoice" }, { status: 500 });
  return NextResponse.json({ invoice: inv });
}
