import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { generateManualInvoiceHtml } from "@/lib/manual-invoice-html";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/manual-invoices/[id]/html
// Returns a self-contained HTML invoice for iframe preview and print-to-PDF.
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const html = await generateManualInvoiceHtml(id);
  if (!html) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(html, {
    headers: {
      "Content-Type":  "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
