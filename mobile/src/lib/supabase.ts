import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — defers initialisation until first use so the client is
// never created during Metro's module-load phase (which runs before the
// native bridge is ready, causing the bridgeless feature-flag warning).
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      "https://jwhnxsfhkoodjdhbibvn.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY",
      {
        realtime:  { params: { eventsPerSecond: 10 } },
        auth:      { persistSession: false },
      }
    );
  }
  return _client;
}

// Keep a named export for screens that import `supabase` directly
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as never)[prop as never];
  },
});
