/**
 * API Key management.
 *
 * Key format: cs_live_<prefix_12><random_20>  (32 chars after "cs_live_")
 *             cs_test_<prefix_12><random_20>  (for test keys)
 *
 * Storage: raw key is shown ONCE at creation; thereafter only sha256(key) is stored.
 * Lookup: key_prefix (first 12 chars of the random portion) → then compare sha256.
 */

import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiKeyScope =
  | "events:read"
  | "events:write"
  | "registrations:read"
  | "registrations:write"
  | "participants:read"
  | "participants:write"
  | "memberships:read"
  | "merchandise:read"
  | "merchandise:write"
  | "finance:read"
  | "communications:read"
  | "communications:write"
  | "webhooks:read"
  | "webhooks:write"
  | "import:write"
  | "*";                   // super-scope for org owners

export const ALL_SCOPES: ApiKeyScope[] = [
  "events:read", "events:write",
  "registrations:read", "registrations:write",
  "participants:read", "participants:write",
  "memberships:read",
  "merchandise:read", "merchandise:write",
  "finance:read",
  "communications:read", "communications:write",
  "webhooks:read", "webhooks:write",
  "import:write",
];

export const READ_ONLY_SCOPES: ApiKeyScope[] = ALL_SCOPES.filter(s => s.endsWith(":read"));

export interface ApiKeyRecord {
  id:              string;
  organization_id: string;
  name:            string;
  description:     string | null;
  key_prefix:      string;
  key_hash:        string;
  key_type:        "live" | "test";
  scopes:          ApiKeyScope[];
  expires_at:      string | null;
  last_used_at:    string | null;
  is_active:       boolean;
  created_by:      string;
  rotated_from:    string | null;
  created_at:      string;
  updated_at:      string;
}

export interface ResolvedApiKey {
  id:              string;
  organization_id: string;
  scopes:          ApiKeyScope[];
  key_type:        "live" | "test";
  name:            string;
}

// ── Key generation ────────────────────────────────────────────────────────────

/**
 * Generates a new API key. Returns both the raw key (shown once to user)
 * and the fields to store in the database.
 */
export function generateApiKey(type: "live" | "test" = "live"): {
  rawKey:    string;
  prefix:    string;
  hash:      string;
} {
  const random  = crypto.randomBytes(24).toString("hex");   // 48 hex chars
  const prefix  = random.slice(0, 12);
  const rawKey  = `cs_${type}_${random}`;
  const hash    = sha256(rawKey);
  return { rawKey, prefix, hash };
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// ── Verification ──────────────────────────────────────────────────────────────

/**
 * Validates an API key from a request.
 * 1. Extract prefix from the raw key.
 * 2. Look up rows matching that prefix.
 * 3. Compare sha256(rawKey) against stored hash (constant-time).
 * 4. Check expiry and is_active.
 * 5. Update last_used_at (fire-and-forget).
 * Returns null if invalid.
 */
export async function verifyApiKey(rawKey: string): Promise<ResolvedApiKey | null> {
  // Basic format check
  if (!rawKey.startsWith("cs_live_") && !rawKey.startsWith("cs_test_")) return null;
  const randomPart = rawKey.slice(8);            // after "cs_live_" or "cs_test_"
  if (randomPart.length !== 48) return null;     // 24 bytes = 48 hex chars
  const prefix   = randomPart.slice(0, 12);
  const incoming = sha256(rawKey);

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("api_keys")
    .select("id, organization_id, key_hash, key_type, scopes, expires_at, is_active, name")
    .eq("key_prefix", prefix)
    .eq("is_active", true)
    .limit(5);  // prefix collision is astronomically unlikely; limit for safety

  if (error || !data?.length) return null;

  // Find matching hash (constant-time comparison to resist timing attacks)
  const match = data.find(row => {
    const stored = Buffer.from(row.key_hash as string, "hex");
    const input  = Buffer.from(incoming, "hex");
    if (stored.length !== input.length) return false;
    return crypto.timingSafeEqual(stored, input);
  });

  if (!match) return null;

  // Check expiry
  if (match.expires_at && new Date(match.expires_at as string) < new Date()) {
    // Mark as expired lazily
    void db.from("api_keys").update({ is_active: false }).eq("id", match.id);
    return null;
  }

  // Update last_used_at async (fire-and-forget — non-critical)
  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", match.id);

  return {
    id:              match.id as string,
    organization_id: match.organization_id as string,
    scopes:          (match.scopes as ApiKeyScope[]) ?? [],
    key_type:        match.key_type as "live" | "test",
    name:            match.name as string,
  };
}

// ── Scope checking ────────────────────────────────────────────────────────────

/**
 * Returns true when the key's scopes include the required scope.
 * `*` grants all scopes.
 */
export function hasScope(key: ResolvedApiKey, required: ApiKeyScope): boolean {
  return key.scopes.includes("*") || key.scopes.includes(required);
}

/**
 * Returns a 403 error payload when the scope is missing.
 */
export function scopeError(required: ApiKeyScope) {
  return {
    error: {
      code:    "FORBIDDEN",
      message: `This API key does not have the '${required}' scope.`,
    },
  };
}

// ── Usage tracking ────────────────────────────────────────────────────────────

/**
 * Logs one API request to api_usage_log. Fire-and-forget — never throws.
 */
export async function logApiUsage(params: {
  api_key_id:      string;
  organization_id: string;
  endpoint:        string;
  method:          string;
  status_code:     number;
  latency_ms?:     number;
}): Promise<void> {
  try {
    const db = getSupabaseServer();
    await db.from("api_usage_log").insert({
      api_key_id:      params.api_key_id,
      organization_id: params.organization_id,
      endpoint:        params.endpoint.slice(0, 500),
      method:          params.method,
      status_code:     params.status_code,
      latency_ms:      params.latency_ms ?? null,
    });
  } catch (e) {
    logger.error("api-key", "Failed to log usage", { error: String(e) });
  }
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

/** Creates and stores a new API key. Returns rawKey + the stored record. */
export async function createApiKey(params: {
  organization_id: string;
  name:            string;
  description?:    string;
  key_type?:       "live" | "test";
  scopes:          ApiKeyScope[];
  expires_at?:     string;    // ISO8601
  created_by:      string;
}): Promise<{ rawKey: string; record: ApiKeyRecord } | null> {
  const { rawKey, prefix, hash } = generateApiKey(params.key_type ?? "live");

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("api_keys")
    .insert({
      organization_id: params.organization_id,
      name:            params.name,
      description:     params.description ?? null,
      key_prefix:      prefix,
      key_hash:        hash,
      key_type:        params.key_type ?? "live",
      scopes:          params.scopes,
      expires_at:      params.expires_at ?? null,
      created_by:      params.created_by,
    })
    .select()
    .single();

  if (error) {
    logger.error("api-key", "createApiKey failed", { error: error.message });
    return null;
  }

  return { rawKey, record: data as ApiKeyRecord };
}

/**
 * Rotates an API key: deactivates the old key and creates a new one
 * with the same settings. Returns the new raw key + record.
 * The old key's `rotated_from` is set on the new key for audit trail.
 */
export async function rotateApiKey(oldKeyId: string, rotatedBy: string): Promise<{ rawKey: string; record: ApiKeyRecord } | null> {
  const db = getSupabaseServer();
  const { data: old, error: fetchErr } = await db
    .from("api_keys")
    .select("*")
    .eq("id", oldKeyId)
    .eq("is_active", true)
    .single();

  if (fetchErr || !old) return null;

  const o = old as ApiKeyRecord;
  const { rawKey, prefix, hash } = generateApiKey(o.key_type);

  // Deactivate old key
  await db.from("api_keys").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", oldKeyId);

  // Create new key
  const { data: created, error: createErr } = await db
    .from("api_keys")
    .insert({
      organization_id: o.organization_id,
      name:            o.name,
      description:     o.description,
      key_prefix:      prefix,
      key_hash:        hash,
      key_type:        o.key_type,
      scopes:          o.scopes,
      expires_at:      o.expires_at,
      created_by:      rotatedBy,
      rotated_from:    oldKeyId,
    })
    .select()
    .single();

  if (createErr) {
    logger.error("api-key", "rotateApiKey failed", { error: createErr.message });
    return null;
  }

  return { rawKey, record: created as ApiKeyRecord };
}
