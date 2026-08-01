#!/usr/bin/env node
/**
 * Generate HMAC user tokens for k6 load tests.
 *
 * Uses the same algorithm as lib/admin-auth.ts signUserToken():
 *   payload = "user:<email>:<exp>"
 *   token   = base64url(email) + "." + exp + "." + HMAC-SHA256(COACH_TOKEN_SECRET, payload)
 *
 * Usage:
 *   COACH_TOKEN_SECRET=<secret> node scripts/gen-load-test-tokens.js \
 *     --emails test1@cs.test,test2@cs.test \
 *     --out tests/load/test-users.json
 *
 * Or with a count to generate synthetic emails:
 *   COACH_TOKEN_SECRET=<secret> node scripts/gen-load-test-tokens.js \
 *     --count 50 --prefix loadtest \
 *     --out tests/load/test-users.json
 *
 * Output format (same as tests/load/test-users.json):
 *   [{ "email": "...", "token": "..." }, ...]
 *
 * The tokens are valid for 90 days. Never commit this file to the repo —
 * it contains valid auth tokens. Add tests/load/test-users.json to .gitignore.
 *
 * IMPORTANT: Only run this against staging. These tokens grant user-level
 * access to the API under the supplied email addresses.
 */

const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

// ── Token generation (mirrors lib/admin-auth.ts) ──────────────────────────────

const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function signUserToken(email, secret) {
  const exp     = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `user:${email.toLowerCase()}:${exp}`;
  const hmac    = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(email.toLowerCase()).toString("base64url")}.${exp}.${hmac}`;
}

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const emailsArg = getArg("--emails");
const countArg  = getArg("--count");
const prefix    = getArg("--prefix") ?? "loadtest";
const outArg    = getArg("--out")    ?? "tests/load/test-users.json";

const secret = process.env.COACH_TOKEN_SECRET ?? process.env.COACH_TOKEN_SECRET_PREV;
if (!secret) {
  console.error("Error: COACH_TOKEN_SECRET environment variable is not set.");
  process.exit(1);
}

// Build email list
let emails = [];
if (emailsArg) {
  emails = emailsArg.split(",").map(e => e.trim()).filter(Boolean);
} else if (countArg) {
  const n = parseInt(countArg, 10);
  if (!Number.isFinite(n) || n < 1) {
    console.error("Error: --count must be a positive integer.");
    process.exit(1);
  }
  for (let i = 1; i <= n; i++) {
    emails.push(`${prefix}${i}@cs.test`);
  }
} else {
  // Default: 10 synthetic test users
  for (let i = 1; i <= 10; i++) {
    emails.push(`${prefix}${i}@cs.test`);
  }
}

// Generate tokens
const tokens = emails.map(email => ({
  email,
  token: signUserToken(email, secret),
}));

// Write output
const outPath = path.resolve(outArg);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(tokens, null, 2) + "\n");

console.log(`Generated ${tokens.length} token(s) → ${outPath}`);
console.log("Expires in 90 days. Do not commit this file.");

// Verify .gitignore covers the output
const gitignorePath = path.resolve("tests/load/.gitignore");
const gitignoreLine = "test-users.json";
if (!fs.existsSync(gitignorePath) || !fs.readFileSync(gitignorePath, "utf8").includes(gitignoreLine)) {
  fs.appendFileSync(gitignorePath, `${gitignoreLine}\n`);
  console.log(`Added ${gitignoreLine} to tests/load/.gitignore`);
}
