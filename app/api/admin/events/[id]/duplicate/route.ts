import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// POST /api/admin/events/[id]/duplicate
// Clones an event as a new draft. Copies:
//   ✓ All event fields (title, dates, location, settings)
//   ✓ Race categories
//   ✓ Sponsors (optional — include_sponsors=true in body)
// Does NOT copy: registrations, participant_count, communication history, results
// New event: status=draft, participant_count=0, new share_slug, title=" (Copy)"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { include_sponsors?: boolean; new_title?: string };

  const db = getSupabaseServer();

  // Fetch source event
  const { data: src, error: srcErr } = await db
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  if (srcErr || !src) return NextResponse.json({ error: srcErr?.message ?? "Event not found" }, { status: 404 });

  // Fetch races and (optionally) sponsors in parallel
  const [{ data: srcRaces }, { data: srcSponsors }] = await Promise.all([
    db.from("event_races").select("*").eq("event_id", id).order("display_order"),
    body.include_sponsors ? db.from("event_sponsors").select("*").eq("event_id", id).order("display_order") : Promise.resolve({ data: [] }),
  ]);

  // Generate unique slug for duplicate
  const baseSlug   = (src.share_slug ?? src.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40));
  const newSlug    = `${baseSlug}-copy-${Date.now().toString(36)}`;
  const newTitle   = body.new_title ?? `${src.title} (Copy)`;

  // ── Create duplicate event ──────────────────────────────────────────────────
  const { data: newEv, error: evErr } = await db
    .from("events")
    .insert({
      title:                 newTitle,
      description:           src.description,
      event_type:            src.event_type,
      event_category:        src.event_category,
      cover_image:           src.cover_image,
      start_date:            src.start_date,
      start_time:            src.start_time,
      end_date:              src.end_date,
      end_time:              src.end_time,
      location:              src.location,
      meeting_point:         src.meeting_point,
      maps_url:              src.maps_url,
      organizer:             src.organizer,
      organizer_email:       src.organizer_email,
      organizer_phone:       src.organizer_phone,
      support_email:         src.support_email,
      max_participants:      src.max_participants,
      registration_required: src.registration_required,
      price:                 src.price,
      distance_categories:   src.distance_categories,
      registration_closes_at: null, // clear — admin must set new date
      terms_conditions:      src.terms_conditions,
      refund_policy:         src.refund_policy,
      cancellation_policy:   src.cancellation_policy,
      waiting_list_enabled:  src.waiting_list_enabled,
      require_login:         src.require_login,
      featured:              false,    // don't feature duplicate by default
      status:                "draft",  // always draft
      share_slug:            newSlug,
      participant_count:     0,
    })
    .select("id, title, share_slug")
    .single();

  if (evErr || !newEv) return NextResponse.json({ error: evErr?.message ?? "Failed to create event" }, { status: 500 });

  // ── Copy races ──────────────────────────────────────────────────────────────
  if (srcRaces?.length) {
    const raceRows = srcRaces.map(r => ({
      event_id:          newEv.id,
      name:              r.name,
      distance:          r.distance,
      price:             r.price,
      max_slots:         r.max_slots,
      status:            r.status,
      timing_chip:       r.timing_chip,
      auto_bib:          r.auto_bib,
      gender_restriction:r.gender_restriction,
      min_age:           r.min_age,
      max_age:           r.max_age,
      reporting_time:    r.reporting_time,
      gun_time:          r.gun_time,
      flag_off_time:     r.flag_off_time,
      description:       r.description,
      display_order:     r.display_order,
    }));
    await db.from("event_races").insert(raceRows);
  }

  // ── Copy sponsors (if requested) ────────────────────────────────────────────
  if (body.include_sponsors && srcSponsors?.length) {
    const sponsorRows = srcSponsors.map(s => ({
      event_id:      newEv.id,
      name:          s.name,
      tier:          s.tier,
      logo_url:      s.logo_url,
      website_url:   s.website_url,
      description:   s.description,
      display_order: s.display_order,
      visible:       s.visible,
    }));
    await db.from("event_sponsors").insert(sponsorRows);
  }

  return NextResponse.json({
    success:     true,
    event_id:    newEv.id,
    title:       newEv.title,
    share_slug:  newEv.share_slug,
    races_copied:    srcRaces?.length ?? 0,
    sponsors_copied: body.include_sponsors ? (srcSponsors?.length ?? 0) : 0,
  });
}
