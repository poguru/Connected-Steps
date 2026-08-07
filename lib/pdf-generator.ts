import type { SupabaseClient } from "@supabase/supabase-js";

const PDF_BUCKET = "documents";

// ── Chrome executable resolution ──────────────────────────────────────────────

type ChromeHandle = { executablePath: string; args: string[]; headless: boolean | "shell" };

const FALLBACK_ARGS = [
  "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
  "--disable-gpu", "--disable-software-rasterizer",
  "--disable-features=VizDisplayCompositor",
  "--font-render-hinting=none", "--single-process",
];

async function resolveChrome(): Promise<ChromeHandle> {
  // 1. Explicit env var override
  for (const v of ["CHROME_EXECUTABLE_PATH", "PUPPETEER_EXECUTABLE_PATH", "CHROME_BIN"]) {
    if (process.env[v]) return { executablePath: process.env[v]!, args: FALLBACK_ARGS, headless: true };
  }

  // 2. @sparticuz/chromium bundled binary.
  //
  //    @sparticuz gates library extraction (al2023.tar.br → libnss3.so etc.) and the
  //    LD_LIBRARY_PATH setup behind isRunningInAwsLambdaNode20(), which checks
  //    AWS_LAMBDA_JS_RUNTIME or AWS_EXECUTION_ENV. Vercel never sets those vars, so the
  //    libraries are never extracted and Chrome crashes immediately with "libnss3.so not found".
  //    Setting AWS_LAMBDA_JS_RUNTIME before the import fixes the detection.
  if (!process.env.AWS_LAMBDA_JS_RUNTIME && !process.env.AWS_EXECUTION_ENV) {
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
  }

  const sparticuzErrors: string[] = [];
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const p = await chromium.executablePath();
    if (p) {
      console.log("[PDF] @sparticuz chromium:", p, "  LD_LIBRARY_PATH:", process.env.LD_LIBRARY_PATH);
      // Use chromium.args (includes --single-process, correct headless flags, etc.)
      return { executablePath: p, args: chromium.args, headless: chromium.headless };
    }
  } catch (e) {
    sparticuzErrors.push((e as Error).message);
    console.warn("[PDF] @sparticuz failed:", (e as Error).message);
  }

  // 3. System Chrome (VPS with Chrome installed)
  const { access } = await import("fs/promises");
  const sysPaths = [
    "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser", "/usr/bin/chromium",
    "/snap/bin/chromium", "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of sysPaths) {
    try { await access(p); console.log("[PDF] System Chrome:", p); return { executablePath: p, args: FALLBACK_ARGS, headless: true }; } catch {}
  }

  throw new Error(
    `No Chrome executable found.\n` +
    `@sparticuz errors: ${sparticuzErrors.join(" | ") || "none"}\n` +
    `System paths tried: ${sysPaths.join(", ")}\n` +
    `Fix: set CHROME_EXECUTABLE_PATH env var or install google-chrome-stable.`
  );
}

// ── Core PDF generation ───────────────────────────────────────────────────────

export async function generatePdfBuffer(html: string): Promise<Buffer> {
  const { executablePath, args, headless } = await resolveChrome();

  const { launch } = await import("puppeteer-core");
  const browser = await launch({ args, executablePath, headless });

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
