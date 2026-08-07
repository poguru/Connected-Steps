import puppeteer from "puppeteer";

const PDF_BUCKET = "documents";

// ── Core PDF generation ───────────────────────────────────────────────────────

export async function generatePdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
      "--disable-extensions",
    ],
  });

  const page = await browser.newPage();
  try {
    // puppeteer 25+ setContent only accepts "load" | "domcontentloaded"
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Extra wait for images from external URLs (Supabase Storage)
    await new Promise(r => setTimeout(r, 1500));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
    await browser.close();
  }
}

// ── Supabase Storage helpers ──────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

async function ensureBucket(db: SupabaseClient) {
  const { data: buckets } = await db.storage.listBuckets();
  if (!buckets?.some(b => b.name === PDF_BUCKET)) {
    await db.storage.createBucket(PDF_BUCKET, { public: false });
  }
}

/** Download cached PDF. Returns null if not cached or on any error. */
export async function getCachedPdf(
  db: SupabaseClient,
  storagePath: string,
): Promise<Buffer | null> {
  try {
    const { data: blob, error } = await db.storage.from(PDF_BUCKET).download(storagePath);
    if (error || !blob) return null;
    return Buffer.from(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

/** Upload PDF to Supabase Storage. Silently ignores errors. */
export async function cachePdf(
  db: SupabaseClient,
  storagePath: string,
  buffer: Buffer,
): Promise<void> {
  try {
    await ensureBucket(db);
    await db.storage.from(PDF_BUCKET).upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  } catch {
    // non-fatal — PDF still served without caching
  }
}

/** Delete cached PDF. Call after editing a record to force regeneration. */
export async function invalidatePdf(
  db: SupabaseClient,
  storagePath: string,
): Promise<void> {
  try {
    await db.storage.from(PDF_BUCKET).remove([storagePath]);
  } catch {
    // non-fatal
  }
}
