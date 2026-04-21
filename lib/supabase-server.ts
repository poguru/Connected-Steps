import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jwhnxsfhkoodjdhbibvn.supabase.co";

export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing Supabase service role key in environment variables");
  return createClient(url, key);
}
