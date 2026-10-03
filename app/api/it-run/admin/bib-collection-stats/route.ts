import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  try {
    const { data: event } = await db
      .from("it_run_events")
      .select("id")
      .eq("slug", "sprint-2")
      .single();

    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Get active/eligible registrations (paid or free, not cancelled)
    const { data: regs } = await db
      .from("it_run_registrations")
      .select("id, participant_count, category_id, it_run_categories(name)")
      .eq("event_id", event.id)
      .in("payment_status", ["paid", "free"])
      .eq("registration_status", "active");

    const regIds = (regs ?? []).map(r => r.id);
    const totalEligibleParticipants = (regs ?? []).reduce((sum, r) => sum + (r.participant_count || 1), 0);

    // Get all participants
    const { data: participants } = await db
      .from("it_run_participants")
      .select("id, registration_id, first_name, last_name, tshirt_size, verification_status, bib_number")
      .in("registration_id", regIds);

    // Get BIB collections
    const { data: bibCollections } = await db
      .from("it_run_bib_collections")
      .select("participant_id");

    const collectedIds = new Set((bibCollections ?? []).map(bc => bc.participant_id));

    // Get T-shirt issuances
    const { data: tshirtIssuances } = await db
      .from("it_run_tshirt_issuances")
      .select("participant_id");

    const issuedTshirtIds = new Set((tshirtIssuances ?? []).map(ti => ti.participant_id));

    // Build size breakdown
    const sizeDemand: Record<string, number> = {};
    const sizeIssued: Record<string, number> = {};

    (participants ?? []).forEach(p => {
      if (p.tshirt_size) {
        sizeDemand[p.tshirt_size] = (sizeDemand[p.tshirt_size] ?? 0) + 1;
        if (issuedTshirtIds.has(p.id)) {
          sizeIssued[p.tshirt_size] = (sizeIssued[p.tshirt_size] ?? 0) + 1;
        }
      }
    });

    const allSizes = Array.from(new Set([...Object.keys(sizeDemand), ...Object.keys(sizeIssued)])).sort();
    const sizeBreakdown = allSizes.map(size => ({
      size,
      required: sizeDemand[size] ?? 0,
      issued: sizeIssued[size] ?? 0,
      remaining: (sizeDemand[size] ?? 0) - (sizeIssued[size] ?? 0),
    }));

    // Build category breakdown
    const categoryMap: Record<string, { name: string; participants: number; collected: number; tshirts: number }> = {};
    (regs ?? []).forEach((r: any) => {
      const catName = r.it_run_categories?.[0]?.name ?? "Unknown";
      if (!categoryMap[catName]) {
        categoryMap[catName] = { name: catName, participants: 0, collected: 0, tshirts: 0 };
      }
      categoryMap[catName].participants += r.participant_count || 1;
    });

    // Count collected & issued per category
    (participants ?? []).forEach(p => {
      const reg = regs?.find(r => r.id === p.registration_id);
      const catName = reg ? ((reg as any).it_run_categories?.[0]?.name ?? "Unknown") : "Unknown";
      if (categoryMap[catName]) {
        if (collectedIds.has(p.id)) categoryMap[catName].collected++;
        if (issuedTshirtIds.has(p.id)) categoryMap[catName].tshirts++;
      }
    });

    // Build exceptions list
    const exceptions: Array<{ type: string; participantId: string; participantName: string; detail: string }> = [];
    (participants ?? []).forEach(p => {
      if (!p.tshirt_size) {
        exceptions.push({
          type: "MISSING_TSHIRT_SIZE",
          participantId: p.id,
          participantName: `${p.first_name} ${p.last_name}`,
          detail: "T-shirt size not configured",
        });
      }
      if (!p.bib_number) {
        exceptions.push({
          type: "MISSING_BIB",
          participantId: p.id,
          participantName: `${p.first_name} ${p.last_name}`,
          detail: "BIB not allocated",
        });
      }
      if (p.verification_status === "rejected") {
        exceptions.push({
          type: "VERIFICATION_REJECTED",
          participantId: p.id,
          participantName: `${p.first_name} ${p.last_name}`,
          detail: "Company verification rejected",
        });
      }
    });

    // Calculate percentages
    const bibCollectedCount = collectedIds.size;
    const tshirtIssuedCount = issuedTshirtIds.size;
    const bibPercent = totalEligibleParticipants > 0 ? Math.round((bibCollectedCount / totalEligibleParticipants) * 100) : 0;
    const tshirtPercent = totalEligibleParticipants > 0 ? Math.round((tshirtIssuedCount / totalEligibleParticipants) * 100) : 0;

    // Get BIB slots
    const { data: slots } = await db
      .from("it_run_bib_slots")
      .select("id, date, start_time, end_time, location, capacity, booked_count")
      .eq("event_id", event.id)
      .order("date, start_time");

    return NextResponse.json({
      kpis: {
        totalEligibleParticipants,
        bibsAllocated: (participants ?? []).filter(p => p.bib_number).length,
        bibsCollected: bibCollectedCount,
        bibsPending: totalEligibleParticipants - bibCollectedCount,
        tshirtIssued: tshirtIssuedCount,
        tshirtPending: totalEligibleParticipants - tshirtIssuedCount,
        exceptionCount: exceptions.length,
      },
      progress: {
        bibCollection: { collected: bibCollectedCount, total: totalEligibleParticipants, percent: bibPercent },
        tshirtIssuance: { issued: tshirtIssuedCount, total: totalEligibleParticipants, percent: tshirtPercent },
      },
      inventory: { sizeBreakdown },
      slots: (slots ?? []).map(s => ({
        date: s.date,
        timeRange: `${s.start_time} - ${s.end_time}`,
        location: s.location,
        capacity: s.capacity,
        booked: s.booked_count ?? 0,
        pending: s.booked_count ?? 0,
      })),
      categories: Object.values(categoryMap).map(cat => ({
        name: cat.name,
        participants: cat.participants,
        collected: cat.collected,
        tshirts: cat.tshirts,
        collectionPercent: cat.participants > 0 ? Math.round((cat.collected / cat.participants) * 100) : 0,
      })),
      exceptions: exceptions.slice(0, 25),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bib-collection-stats]", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
