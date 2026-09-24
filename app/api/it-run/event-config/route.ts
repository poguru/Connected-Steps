import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import type {
  ItRunEventConfig,
  ItRunCategory,
  ItRunParticipantLabel,
  ItRunRegistrationConfig,
} from "@/lib/it-run-types";

// GET /api/it-run/event-config
// Returns comprehensive, UI-ready event configuration for the Sprint-2 registration page.
// The server derives all display-layer values (inclusions, participant_labels, is_soldout)
// so the registration frontend never implements category_type business logic.
//
// Fields marked "→ DB" are populated from a server-side config object below.
// They will be moved to an admin-configurable DB table in a future migration.
export async function GET() {
  const db = getSupabaseServer();

  const { data: event, error: evErr } = await db
    .from("it_run_events")
    .select(
      "id,slug,title,subtitle,tagline,event_date,report_time,flag_off_time,venue_name,venue_address,city,registration_closes_at,status"
    )
    .eq("slug", "sprint-2")
    .single<{
      id: string; slug: string; title: string; subtitle: string | null;
      tagline: string | null; event_date: string; report_time: string | null;
      flag_off_time: string | null; venue_name: string | null;
      venue_address: string | null; city: string | null;
      registration_closes_at: string; status: string;
    }>();

  if (evErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: cats, error: catErr } = await db
    .from("it_run_categories")
    .select(
      "id,slug,name,distance_km,category_type,price_rupees,description,color,includes_timing,includes_medal,includes_tshirt,includes_certificate,max_participants,current_participants"
    )
    .eq("event_id", event.id)
    .eq("is_active", true)
    .order("sort_order");

  if (catErr) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // T-shirt size options — defined here so the frontend never hardcodes them
  const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
  // Child sizes match the DB constraint added in migration 20260924000004
  const CHILD_SIZES = ["5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"];

  const categories: ItRunCategory[] = (cats ?? []).map(c => {
    // Derive inclusions from boolean flags — UI reads string array, not individual flags
    const inclusions: string[] = [];
    if (c.includes_timing)      inclusions.push("Chip Timing");
    if (c.includes_medal)       inclusions.push("Finisher Medal");
    if (c.includes_tshirt)      inclusions.push("Dry-fit T-Shirt");
    if (c.includes_certificate) inclusions.push("Digital Certificate");
    inclusions.push("Race BIB");

    // Derive participant labels from category_type — UI reads labels, not category_type.
    // tshirt_sizes per participant ensures the UI never shows wrong sizes to the wrong participant.
    const participant_labels: ItRunParticipantLabel[] =
      c.category_type === "solo" ? [
        { role: "solo",      label: "You",             is_child: false, tshirt_sizes: ADULT_SIZES },
      ] :
      c.category_type === "duo"  ? [
        { role: "primary",   label: "Runner 1 (You)",  is_child: false, tshirt_sizes: ADULT_SIZES },
        { role: "secondary", label: "Runner 2",         is_child: false, tshirt_sizes: ADULT_SIZES },
      ] :
      /* kid — parent gets adult sizes, child gets age-appropriate child sizes */
      [
        { role: "parent",    label: "Parent",           is_child: false, tshirt_sizes: ADULT_SIZES },
        { role: "child",     label: "Child (age ≤ 10)", is_child: true,  tshirt_sizes: CHILD_SIZES },
      ];

    return {
      id:                   c.id,
      slug:                 c.slug,
      name:                 c.name,
      distance_km:          c.distance_km,
      category_type:        c.category_type as "solo" | "duo" | "kid",
      price_rupees:         c.price_rupees,
      description:          c.description ?? null,
      color:                c.color ?? "#e8620a",
      is_timed:             !!c.includes_timing,
      inclusions,
      participant_count:    c.category_type === "solo" ? 1 : 2,
      participant_labels,
      max_participants:     c.max_participants ?? null,
      current_participants: c.current_participants ?? 0,
      is_soldout:           c.max_participants != null &&
                            (c.current_participants ?? 0) >= c.max_participants,
    };
  });

  // → DB: move to it_run_events columns or a new it_run_registration_config table
  const registration: ItRunRegistrationConfig = {
    coupon_enabled: true,
    contact_email:  "info@connectedsteps.in",
    contact_phone:  null,
    terms: [
      {
        heading: "Eligibility",
        body: "Open to IT/tech professionals. Students from tech colleges are welcome for the Fun Run and Parent & Child Duo categories.",
      },
      {
        heading: "Verification",
        body: "A valid company ID or employee card is required. Our team verifies documents within 24 hours of registration.",
      },
      {
        heading: "Refund Policy",
        body: "Registrations are non-refundable. Transfers to another participant are allowed until January 31, 2027. Email info@connectedsteps.in with the new participant's details.",
      },
      {
        heading: "Age Requirement",
        body: "For the Parent & Child Duo category, the child must be 10 years of age or younger on the event date.",
      },
      {
        heading: "Category Upgrade",
        body: "Upgrades (e.g. 5K to 10K) are allowed until January 28, 2027 by paying the price difference. Email us to request.",
      },
    ],
    instructions: [
      "Book your BIB collection slot from your dashboard after payment is confirmed",
      "Carry original company ID for physical verification if not yet verified online",
      `Report at the venue by ${event.report_time ?? "5:30 AM"} on event day`,
      "No pets, cycles, or wheeled equipment on the race route",
    ],
  };

  const payload: ItRunEventConfig = {
    event: {
      id:                     event.id,
      title:                  event.title,
      subtitle:               event.subtitle ?? "Exclusive for IT Professionals",
      tagline:                event.tagline  ?? "Your Code Compiles. Now Run It.",
      event_date:             event.event_date,
      report_time:            event.report_time    ?? "5:30 AM",
      flag_off_time:          event.flag_off_time  ?? "6:00 AM",
      venue_name:             event.venue_name     ?? "",
      venue_address:          event.venue_address  ?? "",
      city:                   event.city           ?? "",
      registration_opens_at:  null,
      registration_closes_at: event.registration_closes_at,
      status:                 event.status,
    },
    categories,
    registration,
  };

  return NextResponse.json(payload);
}
