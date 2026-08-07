// @sparticuz/chromium bundles its own self-contained Chromium binary that works
// on Lambda, Vercel, and VPS without system Chrome or system library dependencies.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { SupabaseClient } from "@supabase/supabase-js";

const PDF_BUCKET = "documents";

// ── Core PDF generation ───────────────────────────────────────────────────────

export async function generatePdfBuffer(html: string): Promise<Buffer> {
  // chromium.args contains the flags needed for headless/Lambda environments.
  // executablePath() extracts the bundled Chromium binary to /tmp and returns its path.
  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
    executablePath,
    headless: true,
  });

  const page = await browser.newPage();
  try {
    // setContent only accepts "load" | "domcontentloaded" in puppeteer-core 25+
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Let external images (Supabase Storage logo/signature) finish loading
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
