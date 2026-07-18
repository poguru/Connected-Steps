/**
 * Seed an IT Run portal user.
 *
 * Usage:
 *   npx tsx scripts/seed-it-run-portal-user.ts \
 *     --email admin@connectedsteps.in \
 *     --name "Event Admin" \
 *     --role event_admin \
 *     --password "YourSecurePassword123"
 *
 * Roles: event_admin | verification_team | bib_collection | checkin_team | support_desk
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SECRET in .env.local
 */

import * as fs     from "fs";
import * as path   from "path";
import * as crypto from "crypto";

// Load .env.local manually (dotenv not available in this project)
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const VALID_ROLES = ["event_admin", "verification_team", "bib_collection", "checkin_team", "support_desk"] as const;
type PortalRole = typeof VALID_ROLES[number];

function getArg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? (process.argv[idx + 1] ?? "") : "";
}

function hashPassword(password: string, secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHmac("sha256", secret).update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const email    = getArg("--email");
  const name     = getArg("--name");
  const role     = getArg("--role") as PortalRole;
  const password = getArg("--password");

  if (!email || !name || !role || !password) {
    console.error("Usage: npx tsx scripts/seed-it-run-portal-user.ts --email <email> --name <name> --role <role> --password <password>");
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!supabaseUrl || !serviceKey || !adminSecret) {
    console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SECRET");
    process.exit(1);
  }

  const passwordHash = hashPassword(password, adminSecret);

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("it_run_portal_users")
    .upsert({ email: email.toLowerCase(), name, role, password_hash: passwordHash, is_active: true }, { onConflict: "email" })
    .select("id, email, name, role, is_active")
    .single();

  if (error) {
    console.error("Failed to create portal user:", error.message);
    process.exit(1);
  }

  console.log("Portal user created/updated:");
  console.log(`  ID:    ${data.id}`);
  console.log(`  Email: ${data.email}`);
  console.log(`  Name:  ${data.name}`);
  console.log(`  Role:  ${data.role}`);
  console.log("");
  console.log(`Login at: /it-run/admin/login`);
}

main().catch(e => { console.error(e); process.exit(1); });
