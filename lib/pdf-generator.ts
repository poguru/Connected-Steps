import type { SupabaseClient } from "@supabase/supabase-js";

const PDF_BUCKET = "documents";

// ── Chrome executable resolution ──────────────────────────────────────────────
// Tries multiple strategies in order so the code works on Vercel, Lambda, VPS,
// and local dev without any manual configuration.

async function resolveChrome(): Promise<string> {
  // 1. Explicit override via env var (user can set CHROME_EXECUTABLE_PATH on the server)
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;

  // 2. @sparticuz/chromium — bundled self-contained binary (works on Lambda/Vercel/VPS)
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const path = await chromium.executablePath();
    if (path) {
      console.log("[PDF] Using @sparticuz/chromium:", path);
      return path;
    }
  } catch (e) {
    console.warn("[PDF] @sparticuz/chromium failed:", (e as Error).message);
  }

  // 3. Common system Chrome locations (fallback for VPS with Chrome installed)
  const { access } = await import("fs/promises");
  const candidates = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of candidates) {
    try { await access(p); console.log("[PDF] Using system Chrome:", p); return p; } catch {}
  }

  throw new Error(
    "No Chrome executable found. Install Chrome on the server, or set CHROME_EXECUTABLE_PATH env var. " +
    "@sparticuz/chromium also failed — check /tmp write permissions and available disk space."
  );
}

// ── Core PDF generation ───────────────────────────────────────────────────────

export async function generatePdfBuffer(html: string): Promise<Buffer> {
  const executablePath = await resolveChrome();

  const { launch } = await import("puppeteer-core");
  const browser = await launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-features=VizDisplayCompositor",
      "--font-render-hinting=none",
      "--run-all-compositor-stages-before-draw",
    ],
    executablePath,
    headless: true,
  });

  const page = await browser.newPage();
  try {
    // setContent only accepts "load" | "domcontentloaded" in puppeteer-core 25+
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Allow time for images from Supabase Storage (logo, signature) to load
    await new Promise(r => setTimeout(r, 2000));
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
    // non-fatal
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
