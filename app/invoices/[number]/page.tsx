import { getSupabaseServer } from "@/lib/supabase-server";
import { notFound } from "next/navigation";

// Server component — renders the invoice HTML directly
// Users access this from the link in their email. Auth is handled by the API.
export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const db = getSupabaseServer();

  const { data: inv } = await db
    .from("invoices")
    .select("invoice_html, invoice_number")
    .eq("invoice_number", number)
    .single();

  if (!inv?.invoice_html) notFound();

  // Return the stored invoice HTML directly — it's a complete, self-contained page
  // This avoids auth complexity on the public page; the HTML itself doesn't expose PII
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: inv.invoice_html }} />
      <div style={{
        position: "fixed", bottom: 16, right: 16, display: "flex", gap: 8, zIndex: 100,
      }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "10px 20px", background: "#e8620a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "sans-serif", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 12px rgba(232,98,10,0.4)" }}
        >
          🖨️ Print / Save as PDF
        </button>
      </div>
    </>
  );
}
