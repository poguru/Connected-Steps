import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 60; // ISR: rebuild every 60 s; admin changes reflect quickly

export type MembershipPlan = {
  id:              string;
  name:            string;
  slug:            string;
  tagline:         string | null;
  description:     string | null;
  price:           number | null;       // null → contact-only
  currency:        string;
  billing_label:   string | null;
  razorpay_plan:   string | null;
  features:        string[];
  cta_label:       string;
  cta_href:        string | null;
  is_featured:     boolean;
  is_contact_only: boolean;
  display_order:   number;
  badge_label:     string | null;
  color_accent:    string;
};

// ── GET /api/membership-plans ─────────────────────────────────────────────────
// Public endpoint — returns all active plans ordered by display_order.
// Cached at the edge for 60 s; admin changes are reflected after the next
// revalidation cycle (no user-visible stale risk for a pricing page).
export async function GET() {
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("membership_plans")
    .select("id, name, slug, tagline, description, price, currency, billing_label, razorpay_plan, features, cta_label, cta_href, is_featured, is_contact_only, display_order, badge_label, color_accent")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    // Graceful degradation: return empty array rather than 500 so the pricing
    // page can render a "Contact us" fallback instead of crashing.
    console.error("[membership-plans] DB error:", error.message);
    return NextResponse.json({ plans: [] });
  }

  const plans: MembershipPlan[] = (data ?? []).map(row => ({
    ...row,
    features: Array.isArray(row.features) ? row.features as string[] : [],
  }));

  return NextResponse.json({ plans });
}
