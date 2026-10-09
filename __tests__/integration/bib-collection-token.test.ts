import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * BIB Collection Token Persistence Tests
 *
 * Verifies that:
 * 1. Token is generated and persists across multiple requests
 * 2. Token remains valid after slot bookings
 * 3. Token is not invalidated by admin resends
 * 4. Slot selection is idempotent (multiple selections return same state)
 */

describe("BIB Collection Token Persistence", () => {
  let db: ReturnType<typeof getSupabaseServer>;
  let testRegistrationId: string;
  let testToken: string;
  let testParticipantId: string;
  let testSlotId: string;

  beforeAll(async () => {
    db = getSupabaseServer();

    // Create a test registration with payment status "paid"
    const { data: eventData } = await db
      .from("it_run_events")
      .select("id")
      .eq("slug", "sprint-2")
      .single();

    if (!eventData) throw new Error("Sprint-2 event not found");

    const { data: categoryData } = await db
      .from("it_run_categories")
      .select("id")
      .eq("event_id", eventData.id)
      .limit(1)
      .single();

    if (!categoryData) throw new Error("No categories found");

    // Create registration
    const { data: regData, error: regError } = await db
      .from("it_run_registrations")
      .insert({
        event_id: eventData.id,
        category_id: categoryData.id,
        registration_code: `TEST-${Date.now()}`,
        lead_email: `test-bib-${Date.now()}@test.local`,
        participant_count: 1,
        payment_status: "paid",
        registration_status: "active",
      })
      .select("id")
      .single();

    if (regError) throw regError;
    testRegistrationId = regData.id;

    // Create participant
    const { data: partData, error: partError } = await db
      .from("it_run_participants")
      .insert({
        registration_id: testRegistrationId,
        first_name: "Test",
        last_name: "User",
        email: `test-${Date.now()}@test.local`,
        participant_type: "solo",
        bib_name: "TEST USER",
      })
      .select("id")
      .single();

    if (partError) throw partError;
    testParticipantId = partData.id;

    // Get a slot
    const { data: slotData, error: slotError } = await db
      .from("it_run_bib_slots")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (slotError) throw slotError;
    testSlotId = slotData.id;

    // Generate and set token
    const crypto = await import("crypto");
    testToken = crypto.randomBytes(24).toString("hex");

    const { error: tokenError } = await db
      .from("it_run_registrations")
      .update({ bib_invite_token: testToken })
      .eq("id", testRegistrationId);

    if (tokenError) throw tokenError;
  });

  afterAll(async () => {
    // Cleanup
    if (testRegistrationId) {
      await db.from("it_run_bib_bookings").delete().eq("participant_id", testParticipantId);
      await db.from("it_run_participants").delete().eq("id", testParticipantId);
      await db.from("it_run_registrations").delete().eq("id", testRegistrationId);
    }
  });

  it("should retrieve registration by token", async () => {
    const { data, error } = await db
      .from("it_run_registrations")
      .select("id, bib_invite_token")
      .eq("bib_invite_token", testToken)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.id).toBe(testRegistrationId);
    expect(data?.bib_invite_token).toBe(testToken);
  });

  it("should book slot successfully", async () => {
    const { data, error } = await db.rpc("itr_book_bib_slot", {
      p_participant_id: testParticipantId,
      p_slot_id: testSlotId,
    });

    expect(error).toBeNull();
    expect(data).toBe("confirmed");
  });

  it("should token remain valid after booking", async () => {
    // Token should still resolve the same registration after booking
    const { data, error } = await db
      .from("it_run_registrations")
      .select("id, bib_invite_token, registration_status, payment_status")
      .eq("bib_invite_token", testToken)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.id).toBe(testRegistrationId);
    expect(data?.bib_invite_token).toBe(testToken);
    expect(data?.payment_status).toBe("paid");
    expect(data?.registration_status).toBe("active");
  });

  it("should return already_booked on duplicate booking", async () => {
    const { data, error } = await db.rpc("itr_book_bib_slot", {
      p_participant_id: testParticipantId,
      p_slot_id: testSlotId,
    });

    expect(error).toBeNull();
    expect(data).toBe("already_booked");
  });

  it("should not clear token on admin force-resend", async () => {
    // Simulate what happens on admin force resend
    // Only bib_invite_sent_at should be reset, not token
    const { error: resetError } = await db
      .from("it_run_registrations")
      .update({ bib_invite_sent_at: null })
      .eq("id", testRegistrationId);

    expect(resetError).toBeNull();

    // Token should still be valid
    const { data, error } = await db
      .from("it_run_registrations")
      .select("id, bib_invite_token, bib_invite_sent_at")
      .eq("id", testRegistrationId)
      .single();

    expect(error).toBeNull();
    expect(data?.bib_invite_token).toBe(testToken);
    expect(data?.bib_invite_sent_at).toBeNull();
  });

  it("should retrieve booking details after selection", async () => {
    const { data, error } = await db
      .from("it_run_participants")
      .select(`
        id, first_name, last_name,
        it_run_bib_bookings (
          id, status,
          it_run_bib_slots (
            id, location_name, slot_date, start_time, end_time
          )
        )
      `)
      .eq("id", testParticipantId)
      .single();

    expect(error).toBeNull();
    expect(data?.it_run_bib_bookings).toBeDefined();
    expect(data?.it_run_bib_bookings?.length).toBeGreaterThan(0);
    expect(data?.it_run_bib_bookings?.[0]?.status).toBe("confirmed");
  });
});
