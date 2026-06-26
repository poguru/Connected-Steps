import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Module-level singleton ────────────────────────────────────────────────────
// On Vercel serverless, module scope persists for the lifetime of a warm
// function instance (~minutes).  Caching the client here avoids the overhead
// of createClient() on every route handler invocation while remaining safe:
//   • Service-role credentials are env-vars (not request-scoped).
//   • The Supabase JS client is stateless w.r.t. auth (service role never
//     needs session storage).
//   • On cold starts the singleton is rebuilt from current env vars.
//
// Rollback: revert to `return createClient(url, key)` — zero other changes.

let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");

  _client = createClient(url, key, {
    auth: {
      persistSession:    false,   // service role doesn't need session persistence
      autoRefreshToken:  false,   // no token to refresh for service role
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-client-info": "connected-steps-server/1.0" },
    },
  });

  return _client;
}
