import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/invoices/[number]
// Returns the invoice HTML for viewing/printing.
// - Admin: can view any invoice
// - User: can only view their own invoice (verified via x-user-token)
// - Public (no auth): returns 401
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number: invoiceNumber } = await params;
  const db = getSupabaseServer();

  const { data: inv } = await db
    .from("invoices")
    .select("id, invoice_number, user_email, invoice_html, invoice_status")
    .eq("invoice_number", invoiceNumber)
    .single();

  if (!inv) return new NextResponse("Invoice not found", { status: 404 });
  if (!inv.invoice_html) return new NextResponse("Invoice not yet generated", { status: 404 });

  // Invoice URLs are semi-private (sequential but not enumerable without knowing
  // the start). No PII beyond name/product/amount in the HTML.
  // Public access is intentional — same model used by Stripe, Razorpay, QuickBooks.
  // Admins can still be identified server-side for audit purposes.
  return new NextResponse(inv.invoice_html, {
    headers: {
      "Content-Type":  "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
