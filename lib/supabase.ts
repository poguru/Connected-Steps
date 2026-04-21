import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!client) {
    client = createClient(
      "https://jwhnxsfhkoodjdhbibvn.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY"
    );
  }
  return client;
}
