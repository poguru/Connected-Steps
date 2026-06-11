/**
 * Server-side coach data fetching.
 *
 * Reads from the coach_profiles table first; falls back to the hardcoded
 * COACHES array in lib/coach-data.ts if the DB is unavailable or the table
 * is empty. This keeps coach pages live during migration rollout.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { COACHES, getCoachBySlug } from "@/lib/coach-data";
import type { CoachProfile, CoachTestimonial } from "@/lib/coach-data";

interface DbCoachRow {
  slug:             string;
  name:             string;
  role:             string;
  location:         string;
  email:            string;
  photo:            string | null;
  initials:         string;
  bio:              string;
  qualifications:   Array<{ icon: string; text: string }>;
  certifications:   string[];
  experience:       Array<{ icon: string; text: string }>;
  specializations:  string[];
  testimonials:     CoachTestimonial[];
  sessions_coached: number;
  instagram:        string | null;
}

function toCoachProfile(row: DbCoachRow): CoachProfile {
  return {
    slug:            row.slug,
    name:            row.name,
    role:            row.role,
    location:        row.location,
    email:           row.email,
    photo:           row.photo,
    initials:        row.initials,
    bio:             row.bio,
    qualifications:  row.qualifications  ?? [],
    certifications:  row.certifications  ?? [],
    medals:          row.experience      ?? [],
    testimonials:    row.testimonials    ?? [],
    sessionsCoached: row.sessions_coached ?? 0,
    instagram:       row.instagram       ?? undefined,
  };
}

const COLUMNS = [
  "slug", "name", "role", "location", "email", "photo", "initials", "bio",
  "qualifications", "certifications", "experience", "specializations",
  "testimonials", "sessions_coached", "instagram",
].join(", ");

export async function fetchCoachProfiles(): Promise<CoachProfile[]> {
  try {
    const db = getSupabaseServer();
    const { data, error } = await db
      .from("coach_profiles")
      .select(COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return COACHES;
    return (data as unknown as DbCoachRow[]).map(toCoachProfile);
  } catch {
    return COACHES;
  }
}

export async function fetchCoachBySlug(slug: string): Promise<CoachProfile | undefined> {
  try {
    const db = getSupabaseServer();
    const { data, error } = await db
      .from("coach_profiles")
      .select(COLUMNS)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) return getCoachBySlug(slug);
    return toCoachProfile(data as unknown as DbCoachRow);
  } catch {
    return getCoachBySlug(slug);
  }
}

export async function fetchCoachSlugs(): Promise<string[]> {
  try {
    const db = getSupabaseServer();
    const { data, error } = await db
      .from("coach_profiles")
      .select("slug")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return COACHES.map(c => c.slug);
    return data.map((r: { slug: string }) => r.slug);
  } catch {
    return COACHES.map(c => c.slug);
  }
}
