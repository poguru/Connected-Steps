import type { SupabaseClient } from "@supabase/supabase-js";

const PDF_BUCKET = "documents";

// ── Chrome executable resolution ──────────────────────────────────────────────
// Tries multiple strategies in order so the code works on Vercel, Lambda, VPS,
// and local dev without any manual configuration.

async function resolveChrome(): Promise<string> {
  // 1. Explicit override via env var
  for (const v of ["CHROME_EXECUTABLE_PATH", "PUPPETEER_EXECUTABLE_PATH", "CHROME_BIN"]) {
    if (process.env[v]) return process.env[v]!;
  }

  // 2. @sparticuz/chromium bundled binary — try multiple extraction directories in case
  //    the default /tmp is too small or not writable on this host.
  const sparticuzErrors: string[] = [];
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    for (const loc of [undefined, "/var/tmp", "/dev/shm", "/run"]) {
      try {
        const p = await (loc ? chromium.executablePath(loc) : chromium.executablePath());
        if (p) { console.log("[PDF] @sparticuz chromium at:", p); return p; }
      } catch (e) {
        const msg = `${loc ?? "/tmp"}: ${(e as Error).message}`;
        sparticuzErrors.push(msg);
        console.warn("[PDF] @sparticuz failed for", msg);
      }
    }
  } catch (importErr) {
    sparticuzErrors.push(`import: ${(importErr as Error).message}`);
  }

  // 3. System Chrome (VPS with Chrome installed via apt-get)
  const { access } = await import("fs/promises");
  const sysPaths = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of sysPaths) {
    try { await access(p); console.log("[PDF] System Chrome at:", p); return p; } catch {}
  }

  throw new Error(
    `No Chrome executable found.\n` +
    `@sparticuz/chromium errors: ${sparticuzErrors.join(" | ") || "none"}\n` +
    `System paths tried: ${sysPaths.join(", ")}\n` +
    `Fix: run [apt-get install -y google-chrome-stable] on the server, ` +
    `or set the CHROME_EXECUTABLE_PATH environment variable.`
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
