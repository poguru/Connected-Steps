import { chromium } from "@playwright/test";
import * as fs from "fs";

const BASE = "https://www.connectedsteps.in";
const PAGES = ["/", "/sessions", "/events", "/pricing", "/contact"];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results: Record<string, { errors: string[]; netFails: string[] }> = {};

  for (const p of PAGES) {
    const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors: string[]   = [];
    const netFails: string[] = [];

    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("requestfailed", r => {
      const u = r.url();
      if (!u.includes("analytics") && !u.includes("beacon") && !u.includes("hotjar"))
        netFails.push(`${r.method()} ${u} — ${r.failure()?.errorText}`);
    });
    page.on("response", async r => {
      if (r.url().includes("/api/") && r.status() >= 400)
        errors.push(`API ${r.status()} ${r.url()}`);
    });

    await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // Also check broken images
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter(i => !i.complete || i.naturalWidth === 0)
        .map(i => i.src)
        .filter(s => s && !s.startsWith("data:"))
    );
    if (broken.length) errors.push("BROKEN IMGS: " + broken.join(" | "));

    results[p] = { errors, netFails };
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync("tests/audit/error-details.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
