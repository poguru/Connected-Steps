import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Service-role Supabase client for test setup/teardown only. */
export function getTestDb(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.ITR_TEST_SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.SUPABASE_URL
    ?? "";
  const key = process.env.ITR_TEST_SUPABASE_SERVICE_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? "";
  if (!url || !key) {
    throw new Error(
      "DB fixture: set ITR_TEST_SUPABASE_URL + ITR_TEST_SUPABASE_SERVICE_KEY (or the standard Supabase env vars)",
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Fetches the sprint-2 event row. */
export async function getSprintEvent() {
  const db = getTestDb();
  const { data } = await db.from("it_run_events").select("*").eq("slug", "sprint-2").single();
  return data;
}

/** Fetches all active categories for sprint-2, keyed by slug. */
export async function getCategoriesBySlug(): Promise<Record<string, { id: string; price_rupees: number; category_type: string; max_participants: number | null }>> {
  const db  = getTestDb();
  const event = await getSprintEvent();
  if (!event) throw new Error("sprint-2 event not found in DB");
  const { data } = await db
    .from("it_run_categories")
    .select("id,slug,name,price_rupees,category_type,max_participants")
    .eq("event_id", event.id)
    .eq("is_active", true);
  const map: Record<string, { id: string; price_rupees: number; category_type: string; max_participants: number | null }> = {};
  for (const cat of data ?? []) {
    map[cat.slug] = cat;
  }
  return map;
}

/** Deletes a registration and all cascade data. Test cleanup only. */
export async function deleteRegistration(registrationId: string): Promise<void> {
  const db = getTestDb();
  await db.from("it_run_registrations").delete().eq("id", registrationId);
}

/** Deletes multiple registrations created during a test. */
export async function cleanupRegistrations(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = getTestDb();
  await db.from("it_run_registrations").delete().in("id", ids);
}

/** Gets a registration by ID including payment_status and registration_status. */
export async function getRegistration(id: string) {
  const db = getTestDb();
  const { data } = await db.from("it_run_registrations").select("*").eq("id", id).single();
  return data;
}

/** Gets all participants for a registration. */
export async function getParticipants(registrationId: string) {
  const db = getTestDb();
  const { data } = await db.from("it_run_participants").select("*").eq("registration_id", registrationId);
  return data ?? [];
}

/** Gets check-in records for a participant. */
export async function getCheckins(participantId: string) {
  const db = getTestDb();
  const { data } = await db.from("it_run_checkins").select("*").eq("participant_id", participantId);
  return data ?? [];
}

/** Upserts a test coupon. Returns its ID. Caller must delete after test. */
export async function createTestCoupon(
  eventId: string,
  opts: {
    code?: string;
    discountType?: "flat" | "percent";
    discountValue?: number;
    maxUses?: number | null;
    isActive?: boolean;
    expiresAt?: string | null;
    minAmount?: number | null;
  } = {},
): Promise<string> {
  const db = getTestDb();
  const code = opts.code ?? `TEST${Date.now()}`;
  const { data, error } = await db
    .from("it_run_coupons")
    .insert({
      event_id:       eventId,
      code:           code.toUpperCase(),
      discount_type:  opts.discountType ?? "percent",
      discount_value: opts.discountValue ?? 100,
      max_uses:       opts.maxUses ?? null,
      use_count:      0,
      is_active:      opts.isActive ?? true,
      expires_at:     opts.expiresAt ?? null,
      min_amount:     opts.minAmount ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createTestCoupon failed: ${error?.message}`);
  return data.id;
}

/** Deletes a test coupon. */
export async function deleteTestCoupon(couponId: string): Promise<void> {
  const db = getTestDb();
  await db.from("it_run_coupons").delete().eq("id", couponId);
}

/** Force-sets payment_status on a registration for testing purposes. */
export async function forcePaymentStatus(registrationId: string, status: string): Promise<void> {
  const db = getTestDb();
  await db.from("it_run_registrations").update({ payment_status: status }).eq("id", registrationId);
}

/** Force-sets a fake razorpay_order_id on a registration. */
export async function forceOrderId(registrationId: string, orderId: string): Promise<void> {
  const db = getTestDb();
  await db.from("it_run_registrations")
    .update({ razorpay_order_id: orderId, payment_status: "payment_attempted" })
    .eq("id", registrationId);
}
