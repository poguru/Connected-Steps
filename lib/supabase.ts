import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    client = createClient(url, key);
  }
  return client;
}

// Returns null instead of throwing — use for non-critical features (realtime, etc.)
// so the page doesn't crash if env vars are misconfigured.
export function getSupabaseSafe(): SupabaseClient | null {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}
