import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { generateQuotationHtml } from "@/lib/quotation-html";
import { generatePdfBuffer, getCachedPdf, cachePdf } from "@/lib/pdf-generator";

// Must run on Node.js runtime — Edge runtime has no filesystem access for Chrome
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/quotations/[id]/pdf
// ?disposition=inline  → preview in browser
// ?disposition=attachment (default) → download
// ?regen=1 → force regenerate (skip cache)
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });

  const { id }  = await params;
  const url     = new URL(req.url);
  const regen   = url.searchParams.get("regen") === "1";
  const inline  = url.searchParams.get("disposition") === "inline";

  const db = getSupabaseServer();

  const { data: quo } = await db.from("quotations")
    .select("id, quotation_number")
    .eq("id", id).single();
  if (!quo) return new NextResponse("Not found", { status: 404 });

  const storagePath = `quotations/${id}.pdf`;
  const filename    = `${quo.quotation_number}.pdf`;
  const disposition = inline ? "inline" : "attachment";

  let pdfBuffer: Buffer | null = null;

  if (!regen) {
    pdfBuffer = await getCachedPdf(db, storagePath);
  }

  if (!pdfBuffer) {
    const html = await generateQuotationHtml(id);
    if (!html) return new NextResponse("Quotation not found", { status: 404 });

    try {
      pdfBuffer = await generatePdfBuffer(html);
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      const stack   = (err as Error).stack ?? "";
      console.error("[PDF/quotation] generation failed:\n", stack);
      // Return the actual error so admins can diagnose
      return new NextResponse(
        `PDF generation failed.\n\nError: ${message}\n\nStack:\n${stack}`,
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    cachePdf(db, storagePath, pdfBuffer);
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.length),
      "Cache-Control":       "private, no-cache",
    },
  });
}
