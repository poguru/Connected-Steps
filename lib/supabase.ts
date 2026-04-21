import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://jwhnxsfhkoodjdhbibvn.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON;
    client = createClient(url, key);
  }
  return client;
}
