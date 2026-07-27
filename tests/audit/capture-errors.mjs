import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";

const BASE = "https://www.connectedsteps.in";
const PAGES = ["/", "/sessions", "/events", "/pricing", "/contact"];

const browser = await chromium.launch({ headless: true });
const results = {};

for (const p of PAGES) {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors   = [];
  const netFails = [];

  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", r => {
    const u = r.url();
    if (!u.includes("analytics") && !u.includes("beacon") && !u.includes("hotjar") && !u.includes("clarity"))
      netFails.push(r.method() + " " + u + " — " + r.failure()?.errorText);
  });
  page.on("response", async r => {
    if (r.url().includes("/api/") && r.status() >= 400)
      errors.push("API " + r.status() + " " + r.url());
  });

  try {
    await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(4000);
  } catch(e) { errors.push("NAVIGATE: " + e.message); }

  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .filter(i => !i.complete || i.naturalWidth === 0)
      .map(i => i.src)
      .filter(s => s && !s.startsWith("data:"))
  ).catch(() => []);

  results[p] = { errors, netFails, brokenImages: broken };
  await ctx.close();
}

await browser.close();
writeFileSync("tests/audit/error-details.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
