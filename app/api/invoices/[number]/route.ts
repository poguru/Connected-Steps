import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/invoices/[number]
// Returns the invoice HTML for viewing/printing.
// - Admin/coach: can view any invoice
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
    .select("id, invoice_number, user_email, invoice_html, storage_path, invoice_status")
    .eq("invoice_number", invoiceNumber)
    .single();

  if (!inv) return new NextResponse("Invoice not found", { status: 404 });

  // Auth: admin can view any invoice; user can only view their own
  const isAdmin = await isAdminOrCoach(req);
  if (!isAdmin) {
    const token     = req.headers.get("x-user-token");
    const userEmail = token ? await verifyUserToken(token) : null;
    if (!userEmail || userEmail.toLowerCase() !== inv.user_email.toLowerCase()) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  let html: string | null = null;

  // New path: download HTML from Supabase Storage
  if (inv.storage_path) {
    const { data: fileData } = await db.storage
      .from("bills-of-supply")
      .download(inv.storage_path);
    if (fileData) html = await fileData.text();
  }

  // Legacy fallback: serve from DB column (invoices created before storage migration)
  if (!html && inv.invoice_html) html = inv.invoice_html;

  if (!html) return new NextResponse("Invoice not yet generated", { status: 404 });

  return new NextResponse(html, {
    headers: {
      "Content-Type":  "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
