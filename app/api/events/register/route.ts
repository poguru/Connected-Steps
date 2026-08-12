import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML, sendWhatsApp, runRegistrationWAParams } from "@/lib/notify";
import { enqueueJob } from "@/lib/job-queue";
import { handleEventQrEmail } from "@/lib/job-handlers";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import { evaluateAutomations } from "@/lib/automation-engine";
import { recordConsent } from "@/lib/campaign-service";
import { calcEventDiscount } from "@/lib/commerce/pricing";

// Uses crypto.getRandomValues() — 32^6 ≈ 1-billion code space.
// Collision probability at 100 k registrations ≈ 0.001%; negligible in practice.
// On the extremely rare 23505 unique-constraint error the insert returns an error
// and the caller surfaces a 500; the user can safely retry their registration.
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `CS-EVT-${Array.from(bytes).map(b => chars[b % chars.length]).join("")}`;
}

// Synchronous alias kept so call sites read clearly.
function genUniqueCode(): string { return genCode(); }

// Mirrors the REG_DEFAULTS / getRegConfig logic on the registration form page.
// Both layers must stay in sync — this is the single source of truth for defaults.
const REG_CONFIG_DEFAULTS = {
  require_gender:            true,
  require_dob:               true,
  require_blood_group:       true,
  require_emergency_contact: true,
  show_notes:                true,
};

type RegConfig = typeof REG_CONFIG_DEFAULTS;

function getRegCfg(raw: unknown): RegConfig {
  const stored = raw && typeof raw === "object" ? raw as Partial<RegConfig> : {};
  return { ...REG_CONFIG_DEFAULTS, ...stored };
}

interface ParticipantInput {
  first_name:        string;
  last_name?:        string;
  gender:            string;
  date_of_birth:     string;
  blood_group:       string;
  mobile:            string;
  email?:            string;
  distance_category?: string;
  tshirt_size?:      string;
}

export async function POST(req: NextRequest) {
  try {
    // Parse body first — event_id is needed to check require_login inside handlers.
    const body = await req.json();

    // Token is optional at this point: handlers enforce authentication based on
    // the event's require_login flag. If the event requires login (default) and
    // tokenEmail is null the handler returns 401 after the event fetch.
    const token      = req.headers.get("x-user-token");
    const tokenEmail = token ? verifyUserToken(token) : null;

    // Detect multi-participant mode by the presence of a `participants` array
    const isMulti = Array.isArray(body.participants) && body.participants.length > 0;

    if (isMulti) {
      return handleMultiParticipant(body, tokenEmail, req);
    } else {
      return handleSingleParticipant(body, tokenEmail, req);
    }
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── Single-participant (legacy path) ──────────────────────────────────────────
// Unchanged from original — backwards compatible with all existing forms.
// Also creates an event_participants row so the ops portal can scan old codes.

async function handleSingleParticipant(
  body: Record<string, unknown>,
  tokenEmail: string | null,
  req: NextRequest,
): Promise<NextResponse> {
  const {
    event_id, email, name, phone, gender, date_of_birth,
    blood_group, emergency_contact, special_notes, coupon_code,
    distance_category, tshirt_size,
  } = body as Record<string, string | null | undefined>;
  const customFieldsRaw  = (body.custom_fields ?? {}) as Record<string, string>;
  const marketingConsent = body.marketing_consent === true;

  void (async () => {
    try { await getSupabaseServer().rpc("release_expired_slots"); } catch { /* non-critical */ }
  })();

  // Rate limiting
  if (email) {
    const db = getSupabaseServer();
    const ip  = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const [emailCount, ipCount] = await Promise.all([
      db.rpc("record_rate_limit_failure", { p_key: `reg:email:${(email as string).toLowerCase().trim()}`, p_window_ms: 900000 }),
      db.rpc("record_rate_limit_failure", { p_key: `reg:ip:${ip}`, p_window_ms: 60000 }),
    ]);
    if ((emailCount.data ?? 0) > 3) {
      return NextResponse.json({ error: "Too many registration attempts for this email. Please wait 15 minutes." }, { status: 429 });
    }
    if ((ipCount.data ?? 0) > 20) {
      return NextResponse.json({ error: "Too many registration attempts. Please try again in a minute." }, { status: 429 });
    }
  }

  if (!event_id || !email || !name) {
    return NextResponse.json({ error: "event_id, email, and name are required." }, { status: 400 });
  }
  // Note: we intentionally do NOT enforce tokenEmail === body.email here.
  // An authenticated user may register another person (a family member, team-mate, etc.)
  // in the single-participant path. The token only proves the caller is authenticated;
  // ownership of the resulting registration belongs to the body.email address.

  // Phase 1: always-required fields (independent of per-event configuration)
  const errs: string[] = [];
  if (!name || (name as string).trim().length < 3)                       errs.push("Full name must be at least 3 characters.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email as string))    errs.push("Valid email is required.");
  if (!phone || !/^\d{10}$/.test((phone as string).replace(/\s/g, ""))) errs.push("Phone must be exactly 10 digits.");
  if (date_of_birth && new Date(date_of_birth as string) >= new Date())  errs.push("Date of birth must be in the past.");
  if (errs.length > 0) return NextResponse.json({ error: errs[0] }, { status: 400 });

  const db = getSupabaseServer();

  const { data: ev } = await db
    .from("events")
    .select("id, organization_id, title, price, max_participants, participant_count, start_date, start_time, end_date, end_time, registration_closes_at, location, status, distance_categories, collect_tshirt, early_bird_ends_at, registration_config, require_login")
    .eq("id", event_id as string)
    .single();
  if (!ev || ev.status !== "published") {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  // Guest-registration gate: events with require_login=false (explicit opt-out) allow
  // unauthenticated registrations. All other events (default require_login=true or null)
  // require a valid user token.
  const isGuest = tokenEmail === null;
  const requiresLogin = (ev as { require_login?: boolean }).require_login !== false;
  if (requiresLogin && isGuest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 2: per-event-config field validation — mirrors regCfg on the frontend.
  // Only enforce a field as required when the event is configured to show it.
  // Also checks custom_fields[key] as a fallback: when an admin adds a custom
  // EventFormBuilder field with the same field_key (e.g. "gender"), the frontend
  // hides the built-in input and sends the value in custom_fields instead.
  const regCfg = getRegCfg((ev as { registration_config?: unknown }).registration_config);
  const cf = customFieldsRaw as Record<string, string>;
  if (regCfg.require_gender            && !gender            && !cf["gender"]?.trim())            return NextResponse.json({ error: "Gender is required." },                                    { status: 400 });
  if (regCfg.require_dob               && !date_of_birth     && !cf["date_of_birth"]?.trim())     return NextResponse.json({ error: "Date of birth is required." },                           { status: 400 });
  if (regCfg.require_blood_group       && !blood_group       && !cf["blood_group"]?.trim())       return NextResponse.json({ error: "Blood group is required." },                             { status: 400 });
  if (regCfg.require_emergency_contact && !emergency_contact && !cf["emergency_contact"]?.trim()) return NextResponse.json({ error: "Emergency contact is required." },                       { status: 400 });
  if (regCfg.show_notes && (!special_notes || !(special_notes as string).trim()) && !cf["special_notes"]?.trim()) return NextResponse.json({ error: "Special notes are required (enter NA if none)." }, { status: 400 });

  if (ev.registration_closes_at && new Date() >= new Date(ev.registration_closes_at)) {
    return NextResponse.json({ error: "Registration for this event is now closed." }, { status: 403 });
  }
  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowTime = istNow.toTimeString().substring(0, 5);
  const endDate = ev.end_date ?? ev.start_date;
  const endTime = (ev.end_time ?? "23:59").substring(0, 5);
  if (endDate < today || (endDate === today && endTime <= nowTime)) {
    return NextResponse.json({ error: "This event has already ended." }, { status: 403 });
  }

  const cats = (ev as { distance_categories?: string[] }).distance_categories ?? [];
  if (cats.length > 1 && !distance_category) {
    return NextResponse.json({ error: "Please select a distance category." }, { status: 400 });
  }
  if (distance_category && cats.length > 0 && !cats.includes(distance_category as string)) {
    return NextResponse.json({ error: "Invalid distance category for this event." }, { status: 400 });
  }
  const chosenCategory: string | null = cats.length > 0 ? ((distance_category as string) || cats[0]) : null;

  // Race-based pricing: look up the event_races row matching the chosen category.
  // Falls back to ev.price for legacy events that don't use event_races.
  const { data: races } = await db
    .from("event_races")
    .select("id, distance, price, early_bird_price, gender_restriction, min_age, max_age, max_slots")
    .eq("event_id", event_id as string)
    .eq("status", "active");

  const matchedRace = races?.find(r => r.distance === chosenCategory) ?? null;
  const earlyBirdActive =
    !!(ev as { early_bird_ends_at?: string | null }).early_bird_ends_at &&
    new Date() < new Date((ev as { early_bird_ends_at: string }).early_bird_ends_at);
  const isEarlyBird = earlyBirdActive && (matchedRace?.early_bird_price ?? 0) > 0;
  const raceBasePrice = matchedRace
    ? (isEarlyBird ? (matchedRace.early_bird_price as number) : matchedRace.price)
    : null;

  // Race-level gender and age validation (single participant path)
  if (matchedRace) {
    const mr = matchedRace as { gender_restriction?: string | null; min_age?: number | null; max_age?: number | null };
    const catLabel = chosenCategory ?? "this category";

    if (mr.gender_restriction && !["any", "all"].includes(mr.gender_restriction)) {
      const participantGender = (gender as string | undefined)?.toLowerCase();
      if (participantGender && participantGender !== mr.gender_restriction) {
        return NextResponse.json({ error: `${catLabel} is open to ${mr.gender_restriction} participants only.` }, { status: 400 });
      }
    }

    if ((mr.min_age || mr.max_age) && date_of_birth) {
      const birth = new Date(date_of_birth as string);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const mon = now.getMonth() - birth.getMonth();
      if (mon < 0 || (mon === 0 && now.getDate() < birth.getDate())) age--;
      if (mr.min_age && age < mr.min_age) {
        return NextResponse.json({ error: `You must be at least ${mr.min_age} years old for ${catLabel}.` }, { status: 400 });
      }
      if (mr.max_age && age > mr.max_age) {
        return NextResponse.json({ error: `You must be ${mr.max_age} years or younger for ${catLabel}.` }, { status: 400 });
      }
    }
  }

  const VALID_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  if ((ev as { collect_tshirt?: boolean }).collect_tshirt) {
    if (!tshirt_size) return NextResponse.json({ error: "Please select your T-shirt size." }, { status: 400 });
    if (!VALID_SIZES.includes(tshirt_size as string)) return NextResponse.json({ error: "Invalid T-shirt size." }, { status: 400 });
  }
  const chosenTshirtSize: string | null = tshirt_size && VALID_SIZES.includes(tshirt_size as string) ? (tshirt_size as string) : null;

  // Capacity gate — check per-race first, fall back to event-level.
  // Approved waitlist members bypass the gate.
  let approvedWaitlistId: string | null = null;

  // max_slots is already included in the races query above — no extra round-trip needed
  const raceForCap = matchedRace ?? null;

  let capacityExceeded = false;
  let capacityError = "This event is fully booked.";

  if (raceForCap?.max_slots) {
    // Count confirmed registrations for this category
    const { count: catCount } = await db
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event_id as string)
      .eq("distance_category", chosenCategory as string)
      .neq("status", "cancelled")
      .in("payment_status", ["paid", "free"]);

    if ((catCount ?? 0) >= raceForCap.max_slots) {
      capacityExceeded = true;
      capacityError = "This category is fully booked.";
    }
  } else if (ev.max_participants && (ev.participant_count ?? 0) >= ev.max_participants) {
    capacityExceeded = true;
  }

  if (capacityExceeded) {
    // Allow approved waitlist members through
    const wlQuery = db
      .from("event_waitlist")
      .select("id")
      .eq("event_id", event_id as string)
      .eq("user_email", (email as string).toLowerCase().trim())
      .eq("status", "approved");
    const { data: wl } = chosenCategory
      ? await wlQuery.eq("distance_category", chosenCategory).maybeSingle()
      : await wlQuery.is("distance_category", null).maybeSingle();
    approvedWaitlistId = wl?.id ?? null;
    if (!approvedWaitlistId) {
      return NextResponse.json({ error: capacityError }, { status: 409 });
    }
  }

  const { data: existing } = await db
    .from("event_registrations")
    .select("id, registration_code, payment_status")
    .eq("event_id", event_id as string)
    .eq("user_email", (email as string).toLowerCase().trim())
    .maybeSingle();
  if (existing && (existing.payment_status === "free" || existing.payment_status === "paid")) {
    // Also expire their waitlist entry if it's still pending
    if (approvedWaitlistId) {
      await db.from("event_waitlist").update({ status: "expired" }).eq("id", approvedWaitlistId);
    }
    return NextResponse.json({ already: true, registration_code: existing.registration_code });
  }

  // Custom form field validation — respects race_ids scoping
  const { data: formFields } = await db
    .from("event_form_fields")
    .select("field_key, label, required, race_ids")
    .eq("event_id", event_id as string)
    .eq("is_active", true);

  for (const f of (formFields ?? [])) {
    const raceIds: string[] = (f as { race_ids?: string[] }).race_ids ?? [];
    // Skip validation if this field is scoped to a race that the participant didn't select
    if (raceIds.length > 0 && matchedRace && !raceIds.includes(matchedRace.id)) continue;
    if (f.required && !customFieldsRaw[f.field_key]?.trim()) {
      return NextResponse.json({ error: `"${f.label}" is required.` }, { status: 400 });
    }
  }
  // Only keep keys that are actual form fields (prevents arbitrary data injection)
  const validKeys = new Set((formFields ?? []).map(f => f.field_key));
  const customFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(customFieldsRaw)) {
    if (validKeys.has(k)) customFields[k] = String(v).trim();
  }

  // Coupon
  let couponId: string | null = null;
  let discount = 0, discountType = "", discountValue = 0;
  const singleBasePrice = raceBasePrice ?? ev.price;
  if (coupon_code && singleBasePrice > 0) {
    const { data: coupon, error: cpErr } = await db
      .from("coupons")
      .select("id, discount_type, discount_value, expires_at, use_count, max_uses, event_id, assigned_to_email")
      .eq("code", (coupon_code as string).toUpperCase().trim())
      .single();
    if (cpErr || !coupon) return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return NextResponse.json({ error: "This coupon has expired." }, { status: 400 });
    if (coupon.use_count >= coupon.max_uses) return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 400 });
    if (coupon.event_id && coupon.event_id !== event_id) return NextResponse.json({ error: "This coupon is not valid for this event." }, { status: 400 });
    if (coupon.assigned_to_email && coupon.assigned_to_email.toLowerCase() !== (email as string).toLowerCase()) return NextResponse.json({ error: "This coupon is not assigned to your account." }, { status: 400 });
    couponId = coupon.id; discountType = coupon.discount_type; discountValue = coupon.discount_value;
    discount = calcEventDiscount(singleBasePrice, discountType, discountValue);
  }

  const originalPrice = singleBasePrice;
  const finalPrice    = Math.max(0, originalPrice - discount);

  // Free path
  if (finalPrice === 0) {
    // For free registrations (including coupon-to-zero): block same-user re-use now.
    // Paid path handles this check inside the reservation block below.
    if (couponId) {
      const { data: uses } = await db.from("coupon_uses").select("id").eq("coupon_id", couponId).eq("used_by_email", (email as string).toLowerCase()).limit(1);
      if (uses && uses.length > 0) return NextResponse.json({ error: "You have already used this coupon." }, { status: 400 });
    }
    const code    = genUniqueCode();
    const qrToken = signEventQR(code, event_id as string);

    const { data: reg, error: regErr } = await db
      .from("event_registrations")
      .upsert({
        registration_code: code,
        event_id:          event_id as string,
        user_email:        (email as string).toLowerCase().trim(),
        user_name:         (name as string).trim(),
        phone:             phone || null,
        gender:            gender || null,
        date_of_birth:     date_of_birth || null,
        blood_group:       blood_group || null,
        emergency_contact: emergency_contact || null,
        special_notes:     special_notes || null,
        coupon_code:       coupon_code ? (coupon_code as string).toUpperCase().trim() : null,
        coupon_id:         couponId,
        coupon_discount:   discount,
        original_price:    originalPrice,
        final_price:       finalPrice,
        payment_status:    "free",
        status:            "confirmed",
        distance_category: chosenCategory,
        tshirt_size:       chosenTshirtSize,
        race_id:           matchedRace?.id ?? null,
        is_early_bird:     isEarlyBird,
        custom_fields:     customFields,
        qr_token:          qrToken,
        participant_count: 1,
      }, { onConflict: "event_id,user_email", ignoreDuplicates: false })
      .select("id, registration_code, qr_token")
      .single();
    if (regErr) {
      if (regErr.message?.includes("fully booked")) {
        return NextResponse.json({ error: "This category is fully booked." }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const finalCode  = reg?.registration_code ?? code;
    const finalQr    = reg?.qr_token          ?? qrToken;
    const regId      = reg?.id                ?? "";

    if (couponId) {
      const { redeemCoupon } = await import("@/lib/coupon-redeem");
      // Awaited so audit row is written before we confirm registration to the user.
      // Returns false only under a concurrent race (both callers passed the pre-check);
      // registration is kept — the user already has their confirmed spot.
      const claimed = await redeemCoupon(couponId, (email as string).toLowerCase()).catch(() => false);
      if (!claimed) {
        console.warn(`[event-register] coupon ${couponId} could not be redeemed for ${email} — concurrent race or already exhausted; registration kept`);
      }
    }

    // Enqueue for durability/retry — survives function restarts.
    const qrPayload = {
      registrationId:   regId,
      registrationCode: finalCode,
      eventId:          event_id as string,
      userEmail:        (email as string).toLowerCase().trim(),
      userName:         (name as string).trim(),
      eventTitle:       ev.title,
      startDate:        ev.start_date,
      startTime:        ev.start_time ?? null,
      location:         ev.location,
      distanceCategory: chosenCategory,
    };
    if (regId) {
      await enqueueJob("event_qr_email", qrPayload, {
        idempotencyKey: `event_qr_email:${regId}`,
        priority: 10,
      });
    }

    // Create the participant row so the ops portal can scan this registration
    if (regId) {
      const nameParts  = (name as string).trim().split(" ");
      const firstName  = nameParts[0];
      const lastName   = nameParts.slice(1).join(" ") || null;
      const participantQr = signEventQR(`${regId}`, event_id as string);
      await db.from("event_participants").upsert({
        event_id:          event_id as string,
        registration_id:   regId,
        account_email:     (email as string).toLowerCase().trim(),
        first_name:        firstName,
        last_name:         lastName,
        gender:            gender || null,
        dob:               date_of_birth || null,
        blood_group:       blood_group || null,
        mobile:            phone || null,
        email:             (email as string).toLowerCase().trim(),
        distance_category: chosenCategory,
        tshirt_size:       chosenTshirtSize,
        qr_token:          finalQr ?? participantQr,
        status:            "active",
      }, { onConflict: "qr_token", ignoreDuplicates: true });
    }

    after(async () => {
      if (!regId) {
        console.error(`[event-register] no regId for ${finalCode} — email not sent`);
        return;
      }
      try {
        await handleEventQrEmail(qrPayload);
      } catch (e) {
        console.error("[event-register] QR email failed (registration intact):", e);
      }

      // WhatsApp confirmation (fire-and-forget — non-critical)
      if (phone?.trim()) {
        sendWhatsApp(
          (phone as string).trim(),
          runRegistrationWAParams((name as string).trim(), ev.title, ev.start_date, ev.location),
          "run_registration",
        ).catch((e: unknown) => console.error("[event-register] WhatsApp failed:", e));
      }

      if (ev.organization_id) {
        const ctx = { registration_id: regId, event_id: event_id as string, user_email: (email as string).toLowerCase().trim(), payment_status: "free" };
        dispatchWebhookEvent(ev.organization_id as string, "registration.created", ctx).catch(() => {});
        evaluateAutomations(ev.organization_id as string, "registration.created", ctx).catch(() => {});
      }

      // Save marketing consent
      const bgDb2 = getSupabaseServer();
      const lowerEmail = (email as string).toLowerCase().trim();
      try {
        await bgDb2.from("users").update({
          marketing_consent:        marketingConsent,
          marketing_consent_at:     new Date().toISOString(),
          marketing_consent_source: "registration",
        }).eq("email", lowerEmail);
        await bgDb2.from("user_notification_preferences").upsert({
          user_email:      lowerEmail,
          email_marketing: marketingConsent,
          wa_marketing:    marketingConsent,
          updated_at:      new Date().toISOString(),
        }, { onConflict: "user_email" });
        await recordConsent({
          userEmail:            lowerEmail,
          action:               marketingConsent ? "opt_in" : "initial",
          preferencesSnapshot:  { email_marketing: marketingConsent, wa_marketing: marketingConsent },
          source:               "registration",
          ipAddress:            req.headers.get("x-forwarded-for") ?? "",
        });
      } catch { /* non-critical */ }
    });

    // Consume the approved waitlist slot now that registration is confirmed.
    if (approvedWaitlistId) {
      await db.from("event_waitlist").update({ status: "expired" }).eq("id", approvedWaitlistId);
    }

    return NextResponse.json({ success: true, free: true, registration_code: finalCode });
  }

  // Paid path
  const code = existing?.registration_code ?? genUniqueCode();
  const { error: regErr2 } = await db
    .from("event_registrations")
    .upsert({
      registration_code: code,
      event_id:          event_id as string,
      user_email:        (email as string).toLowerCase().trim(),
      user_name:         (name as string).trim(),
      phone:             phone || null,
      gender:            gender || null,
      date_of_birth:     date_of_birth || null,
      blood_group:       blood_group || null,
      emergency_contact: emergency_contact || null,
      special_notes:     special_notes || null,
      coupon_code:       coupon_code ? (coupon_code as string).toUpperCase().trim() : null,
      coupon_id:         couponId,
      coupon_discount:   discount,
      original_price:    originalPrice,
      final_price:       finalPrice,
      payment_status:    "pending",
      status:            "pending_payment",
      distance_category: chosenCategory,
      tshirt_size:       chosenTshirtSize,
      race_id:           matchedRace?.id ?? null,
      is_early_bird:     isEarlyBird,
      custom_fields:     customFields,
      participant_count: 1,
    }, { onConflict: "event_id,user_email", ignoreDuplicates: false });
  if (regErr2) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Claim the coupon atomically at reservation time (prevents concurrent users
  // from both passing the quota check and both receiving the discount).
  if (couponId) {
    const { data: existingUse } = await db
      .from("coupon_uses")
      .select("id")
      .eq("coupon_id", couponId)
      .eq("used_by_email", (email as string).toLowerCase())
      .maybeSingle();

    if (existingUse) {
      // Coupon already claimed. Allow only if this is a payment retry for the same
      // pending registration (existing row is still unpaid). Otherwise reject.
      const isRetry = existing != null && existing.payment_status === "pending";
      if (!isRetry) {
        return NextResponse.json({ error: "You have already used this coupon." }, { status: 400 });
      }
      // isRetry: discount already locked in — proceed without re-claiming.
    } else {
      const { redeemCoupon } = await import("@/lib/coupon-redeem");
      const claimed = await redeemCoupon(couponId, (email as string).toLowerCase()).catch(() => false);
      if (claimed === false) {
        // Another concurrent registration won the last quota slot — undo the pending row.
        await db.from("event_registrations").delete().eq("registration_code", code);
        return NextResponse.json({ error: "This coupon has just reached its usage limit. Please register without the coupon." }, { status: 409 });
      }
    }
  }

  // Create a pending participant row so it exists in the ops portal pre-payment.
  // Only insert if no participant row exists yet (handles payment re-attempts).
  const { data: pendingReg } = await db
    .from("event_registrations")
    .select("id")
    .eq("registration_code", code)
    .single();
  if (pendingReg?.id) {
    const { count } = await db
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", pendingReg.id);
    if (!count || count === 0) {
      const nameParts = (name as string).trim().split(" ");
      await db.from("event_participants").insert({
        event_id:          event_id as string,
        registration_id:   pendingReg.id,
        account_email:     (email as string).toLowerCase().trim(),
        first_name:        nameParts[0],
        last_name:         nameParts.slice(1).join(" ") || null,
        gender:            gender || null,
        dob:               date_of_birth || null,
        blood_group:       blood_group || null,
        mobile:            phone || null,
        email:             (email as string).toLowerCase().trim(),
        distance_category: chosenCategory,
        tshirt_size:       chosenTshirtSize,
        status:            "pending_payment",
      });
    }
  }

  return NextResponse.json({
    success: true,
    free: false,
    requires_payment: true,
    registration_code: code,
    original_price: originalPrice,
    coupon_discount: discount,
    final_price: finalPrice,
  });
}

// ── Multi-participant path ─────────────────────────────────────────────────────
// Body: { event_id, email (account), emergency_contact, special_notes,
//         coupon_code?, participants: ParticipantInput[] }
// Price = participants.length × ev.price - discount (coupon applied once per booking)

async function handleMultiParticipant(
  body: Record<string, unknown>,
  tokenEmail: string | null,
  _req: NextRequest,
): Promise<NextResponse> {
  void (async () => {
    try { await getSupabaseServer().rpc("release_expired_slots"); } catch { /* non-critical */ }
  })();

  const {
    event_id,
    email: accountEmailRaw,
    emergency_contact,
    special_notes,
    coupon_code,
  } = body as Record<string, string | null | undefined>;
  const multiCustomFieldsRaw = (body.custom_fields ?? {}) as Record<string, string>;

  const participants = body.participants as ParticipantInput[];

  if (!event_id || !accountEmailRaw) {
    return NextResponse.json({ error: "event_id and email are required." }, { status: 400 });
  }
  const accountEmail = (accountEmailRaw as string).toLowerCase().trim();
  // For authenticated users: verify token matches the booking email.
  // Guests supply their email directly; the require_login gate is checked after event fetch.
  if (tokenEmail !== null && tokenEmail.toLowerCase() !== accountEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (participants.length < 1 || participants.length > 10) {
    return NextResponse.json({ error: "Between 1 and 10 participants are allowed per booking." }, { status: 400 });
  }

  // Phase 1: always-required participant fields (independent of event configuration)
  const VALID_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  for (let i = 0; i < participants.length; i++) {
    const p   = participants[i];
    const idx = i + 1;
    if (!p.first_name?.trim()) return NextResponse.json({ error: `Participant ${idx}: first name is required.` }, { status: 400 });
    if (!p.mobile || !/^\d{10}$/.test(p.mobile.replace(/\s/g, ""))) return NextResponse.json({ error: `Participant ${idx}: phone must be exactly 10 digits.` }, { status: 400 });
    if (p.date_of_birth && new Date(p.date_of_birth) >= new Date()) return NextResponse.json({ error: `Participant ${idx}: date of birth must be in the past.` }, { status: 400 });
    if (p.tshirt_size && !VALID_SIZES.includes(p.tshirt_size)) return NextResponse.json({ error: `Participant ${idx}: invalid T-shirt size.` }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: ev } = await db
    .from("events")
    .select("id, title, price, max_participants, participant_count, start_date, start_time, end_date, end_time, registration_closes_at, location, status, distance_categories, collect_tshirt, allow_multi_participant, max_per_registration, early_bird_ends_at, organization_id, registration_config, require_login")
    .eq("id", event_id as string)
    .single();
  if (!ev || ev.status !== "published") {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  // Guest-registration gate for multi-participant path.
  if ((ev as { require_login?: boolean }).require_login !== false && tokenEmail === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 2: per-event-config field validation for each participant
  const multiRegCfg = getRegCfg((ev as { registration_config?: unknown }).registration_config);
  for (let i = 0; i < participants.length; i++) {
    const p   = participants[i];
    const idx = i + 1;
    if (multiRegCfg.require_gender      && !p.gender)       return NextResponse.json({ error: `Participant ${idx}: gender is required.` },       { status: 400 });
    if (multiRegCfg.require_dob         && !p.date_of_birth) return NextResponse.json({ error: `Participant ${idx}: date of birth is required.` }, { status: 400 });
    if (multiRegCfg.require_blood_group && !p.blood_group)  return NextResponse.json({ error: `Participant ${idx}: blood group is required.` },  { status: 400 });
  }
  if (multiRegCfg.require_emergency_contact && !emergency_contact) return NextResponse.json({ error: "Emergency contact is required." }, { status: 400 });
  if (multiRegCfg.show_notes && !special_notes?.trim()) return NextResponse.json({ error: "Special notes are required (enter NA if none)." }, { status: 400 });

  // Fetch active races for per-race pricing and per-race participant limits
  const { data: multiRaces } = await db
    .from("event_races")
    .select("id, distance, price, early_bird_price, price_type, min_participants, max_participants, max_slots")
    .eq("event_id", event_id as string)
    .eq("status", "active");

  // Enforce per-race max_participants — use the lead participant's race as the constraint
  // (all participants in a group booking share the same race in most scenarios)
  const leadCat = participants[0]?.distance_category ?? null;
  const leadRace = multiRaces?.find(r => r.distance === leadCat) ?? multiRaces?.[0] ?? null;
  const raceMinPer = (leadRace as { min_participants?: number | null } | null)?.min_participants ?? 0;
  const raceMaxPer = leadRace?.max_participants ?? 0;
  const evMaxPer   = (ev as { max_per_registration?: number }).max_per_registration ?? 0;
  const effectiveMax = raceMaxPer > 0 ? raceMaxPer : (evMaxPer > 0 ? evMaxPer : 20);
  if (raceMinPer > 0 && participants.length < raceMinPer) {
    return NextResponse.json({ error: `Minimum ${raceMinPer} participants required per booking for this category.` }, { status: 400 });
  }
  if (participants.length > effectiveMax) {
    return NextResponse.json({ error: `Maximum ${effectiveMax} participants per booking for this category.` }, { status: 400 });
  }

  if (ev.registration_closes_at && new Date() >= new Date(ev.registration_closes_at)) {
    return NextResponse.json({ error: "Registration for this event is now closed." }, { status: 403 });
  }
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today  = istNow.toISOString().split("T")[0];
  const nowTime = istNow.toTimeString().substring(0, 5);
  const endDate = ev.end_date ?? ev.start_date;
  const endTime = (ev.end_time ?? "23:59").substring(0, 5);
  if (endDate < today || (endDate === today && endTime <= nowTime)) {
    return NextResponse.json({ error: "This event has already ended." }, { status: 403 });
  }

  // Capacity check — approved waitlist members bypass this (1 reserved spot).
  const capacityWouldExceed = ev.max_participants
    && (ev.participant_count ?? 0) + participants.length > ev.max_participants;
  if (capacityWouldExceed) {
    const { data: wl } = await db
      .from("event_waitlist")
      .select("id")
      .eq("event_id", event_id as string)
      .eq("user_email", accountEmail)
      .eq("status", "approved")
      .maybeSingle();
    if (!wl) {
      return NextResponse.json({ error: "Not enough spots available for your group size." }, { status: 409 });
    }
  }

  // Per-race max_slots check: count how many participants this booking adds per category
  // and verify the race still has room (FOR UPDATE locking is handled by the DB trigger).
  if (multiRaces && multiRaces.length > 0) {
    const countByRace = new Map<string, number>();
    for (const p of participants) {
      const cat = p.distance_category ?? leadCat ?? "";
      countByRace.set(cat, (countByRace.get(cat) ?? 0) + 1);
    }
    for (const [cat, count] of countByRace) {
      const race = multiRaces.find(r => r.distance === cat);
      const slots = (race as { max_slots?: number | null } | null)?.max_slots ?? 0;
      if (slots > 0) {
        const { count: used } = await db
          .from("event_registrations")
          .select("*", { count: "exact", head: true })
          .eq("event_id", event_id as string)
          .eq("distance_category", cat)
          .neq("status", "cancelled")
          .in("payment_status", ["paid", "free"]);
        if ((used ?? 0) + count > slots) {
          return NextResponse.json(
            { error: `The ${cat} category is at capacity. Only ${slots - (used ?? 0)} spot(s) remaining.` },
            { status: 409 }
          );
        }
      }
    }
  }

  // Validate distance categories per participant
  const cats = (ev as { distance_categories?: string[] }).distance_categories ?? [];
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (cats.length > 1 && !p.distance_category) {
      return NextResponse.json({ error: `Participant ${i + 1}: please select a distance category.` }, { status: 400 });
    }
    if (p.distance_category && cats.length > 0 && !cats.includes(p.distance_category)) {
      return NextResponse.json({ error: `Participant ${i + 1}: invalid distance category.` }, { status: 400 });
    }
    if ((ev as { collect_tshirt?: boolean }).collect_tshirt && !p.tshirt_size) {
      return NextResponse.json({ error: `Participant ${i + 1}: T-shirt size is required.` }, { status: 400 });
    }
    // Resolve single-category events
    if (cats.length === 1 && !p.distance_category) p.distance_category = cats[0];
  }

  // Duplicate check
  const { data: existing } = await db
    .from("event_registrations")
    .select("id, registration_code, payment_status, participant_count")
    .eq("event_id", event_id as string)
    .eq("user_email", accountEmail)
    .maybeSingle();
  if (existing && (existing.payment_status === "free" || existing.payment_status === "paid")) {
    return NextResponse.json({ already: true, registration_code: existing.registration_code });
  }

  // Custom form field validation — respects race_ids scoping (booking-level custom fields)
  const { data: multiFormFields } = await db
    .from("event_form_fields")
    .select("field_key, label, required, race_ids")
    .eq("event_id", event_id as string)
    .eq("is_active", true);

  for (const f of (multiFormFields ?? [])) {
    const raceIds: string[] = (f as { race_ids?: string[] }).race_ids ?? [];
    if (raceIds.length > 0 && leadRace && !raceIds.includes(leadRace.id)) continue;
    if (f.required && !multiCustomFieldsRaw[f.field_key]?.trim()) {
      return NextResponse.json({ error: `"${f.label}" is required.` }, { status: 400 });
    }
  }
  const multiValidKeys = new Set((multiFormFields ?? []).map(f => f.field_key));
  const multiCustomFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(multiCustomFieldsRaw)) {
    if (multiValidKeys.has(k)) multiCustomFields[k] = String(v).trim();
  }

  // Per-race pricing: sum up each participant's race price.
  // For per_registration races (flat fee), only count once regardless of participant count.
  const earlyBirdActiveMulti =
    !!(ev as { early_bird_ends_at?: string | null }).early_bird_ends_at &&
    new Date() < new Date((ev as { early_bird_ends_at: string }).early_bird_ends_at);

  let totalBeforeDiscount = 0;
  for (const p of participants) {
    const pRace = multiRaces?.find(r => r.distance === (p.distance_category ?? leadCat)) ?? leadRace;
    if (pRace) {
      const pIsEarly = earlyBirdActiveMulti && (pRace.early_bird_price ?? 0) > 0;
      const pPrice   = pIsEarly ? (pRace.early_bird_price as number) : pRace.price;
      if (pRace.price_type === "per_registration") {
        // Flat fee — only add once (use the first participant's price for the whole booking)
        if (p === participants[0]) totalBeforeDiscount += pPrice;
      } else {
        totalBeforeDiscount += pPrice;
      }
    } else {
      totalBeforeDiscount += ev.price;
    }
  }

  // Coupon — applied once to the total booking, not N times
  let couponId: string | null = null;
  let discount = 0, discountType = "", discountValue = 0;
  if (coupon_code && totalBeforeDiscount > 0) {
    const { data: coupon, error: cpErr } = await db
      .from("coupons")
      .select("id, discount_type, discount_value, expires_at, use_count, max_uses, event_id, assigned_to_email")
      .eq("code", (coupon_code as string).toUpperCase().trim())
      .single();
    if (cpErr || !coupon) return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return NextResponse.json({ error: "This coupon has expired." }, { status: 400 });
    if (coupon.use_count >= coupon.max_uses) return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 400 });
    if (coupon.event_id && coupon.event_id !== event_id) return NextResponse.json({ error: "This coupon is not valid for this event." }, { status: 400 });
    if (coupon.assigned_to_email && coupon.assigned_to_email.toLowerCase() !== accountEmail) return NextResponse.json({ error: "This coupon is not assigned to your account." }, { status: 400 });
    couponId = coupon.id; discountType = coupon.discount_type; discountValue = coupon.discount_value;
    discount = calcEventDiscount(totalBeforeDiscount, discountType, discountValue);
  }

  const originalPrice = totalBeforeDiscount;
  const finalPrice    = Math.max(0, originalPrice - discount);
  const leadParticipant = participants[0];
  const leadName = [leadParticipant.first_name, leadParticipant.last_name].filter(Boolean).join(" ");

  // ── Free (or fully-discounted) multi-participant path ────────────────────────
  if (finalPrice === 0) {
    // Guard coupon re-use before confirming (paid path handles this in its own block).
    if (couponId) {
      const { data: uses } = await db.from("coupon_uses").select("id").eq("coupon_id", couponId).eq("used_by_email", accountEmail).limit(1);
      if (uses && uses.length > 0) return NextResponse.json({ error: "You have already used this coupon." }, { status: 400 });
    }
    const code = genUniqueCode();

    const { data: reg, error: regErr } = await db
      .from("event_registrations")
      .upsert({
        registration_code: code,
        event_id:          event_id as string,
        user_email:        accountEmail,
        user_name:         leadName,
        phone:             leadParticipant.mobile || null,
        gender:            leadParticipant.gender || null,
        date_of_birth:     leadParticipant.date_of_birth || null,
        blood_group:       leadParticipant.blood_group || null,
        emergency_contact: emergency_contact || null,
        special_notes:     special_notes || null,
        coupon_code:       coupon_code ? (coupon_code as string).toUpperCase().trim() : null,
        coupon_id:         couponId,
        coupon_discount:   discount,
        original_price:    originalPrice,
        final_price:       finalPrice,
        payment_status:    "free",
        status:            "confirmed",
        distance_category: leadParticipant.distance_category ?? null,
        tshirt_size:       leadParticipant.tshirt_size ?? null,
        custom_fields:     multiCustomFields,
        participant_count: participants.length,
      }, { onConflict: "event_id,user_email", ignoreDuplicates: false })
      .select("id, registration_code")
      .single();
    if (regErr || !reg) {
      if (regErr?.message?.includes("fully booked")) {
        return NextResponse.json({ error: "This category is fully booked." }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const regId    = reg.id;
    const finalCode = reg.registration_code;

    // Create participant rows with QR tokens
    const participantRows = participants.map(p => {
      const qr = signEventQR(regId + "_" + (participants.indexOf(p)), event_id as string);
      return {
        event_id:          event_id as string,
        registration_id:   regId,
        account_email:     accountEmail,
        first_name:        p.first_name.trim(),
        last_name:         p.last_name?.trim() || null,
        gender:            p.gender || null,
        dob:               p.date_of_birth || null,
        blood_group:       p.blood_group || null,
        mobile:            p.mobile || null,
        email:             p.email?.toLowerCase().trim() || accountEmail,
        distance_category: p.distance_category ?? null,
        tshirt_size:       p.tshirt_size ?? null,
        qr_token:          qr,
        status:            "active",
      };
    });

    const { data: createdParticipants, error: pErr } = await db
      .from("event_participants")
      .insert(participantRows)
      .select("id, first_name, last_name, email, qr_token, distance_category, tshirt_size");
    if (pErr) console.error("[multi-register] participant insert error:", pErr.message);

    if (couponId) {
      const { redeemCoupon } = await import("@/lib/coupon-redeem");
      const claimed = await redeemCoupon(couponId, accountEmail).catch(() => false);
      if (!claimed) {
        console.warn(`[multi-register] coupon ${couponId} could not be redeemed for ${accountEmail} — concurrent race or already exhausted; registration kept`);
      }
    }

    after(async () => {
      if (!createdParticipants?.length) return;
      const subject = `Event Registration Confirmed – ${ev.title}`;
      try {
        // Send one email per participant so each gets their individual QR.
        // Use the participant's own email if provided; fall back to the purchaser's.
        for (const p of createdParticipants) {
          const participantName = [p.first_name, p.last_name].filter(Boolean).join(" ");
          const recipientEmail  = (p as { email?: string | null }).email?.trim() || accountEmail;
          await sendEmail(
            recipientEmail,
            participantName,
            subject,
            eventRegistrationEmailHTML({
              name:             participantName,
              eventTitle:       ev.title,
              startDate:        ev.start_date,
              startTime:        ev.start_time ?? null,
              location:         ev.location,
              registrationCode: finalCode,
              distanceCategory: p.distance_category ?? null,
              qrToken:          p.qr_token ?? undefined,
            }),
            false, true,
          );
        }
        await db.from("event_registrations").update({
          confirmation_email_sent_at: new Date().toISOString(),
          email_status:               "sent",
          qr_generated_at:            new Date().toISOString(),
        }).eq("id", regId);
      } catch (e) {
        console.error("[multi-register] email exception:", e);
        await db.from("event_registrations").update({ email_status: "failed" }).eq("id", regId);
      }

      // WhatsApp confirmation to lead participant (fire-and-forget — non-critical)
      if (leadParticipant.mobile?.trim()) {
        sendWhatsApp(
          leadParticipant.mobile.trim(),
          runRegistrationWAParams(leadName, ev.title, ev.start_date, ev.location),
          "run_registration",
        ).catch((e: unknown) => console.error("[multi-register] WhatsApp failed:", e));
      }
    });

    return NextResponse.json({
      success: true,
      free: true,
      registration_code: finalCode,
      participant_count: participants.length,
    });
  }

  // ── Paid multi-participant path ───────────────────────────────────────────────
  const code = existing?.registration_code ?? genUniqueCode();
  const { error: regErr2 } = await db
    .from("event_registrations")
    .upsert({
      registration_code: code,
      event_id:          event_id as string,
      user_email:        accountEmail,
      user_name:         leadName,
      phone:             leadParticipant.mobile || null,
      gender:            leadParticipant.gender || null,
      date_of_birth:     leadParticipant.date_of_birth || null,
      blood_group:       leadParticipant.blood_group || null,
      emergency_contact: emergency_contact || null,
      special_notes:     special_notes || null,
      coupon_code:       coupon_code ? (coupon_code as string).toUpperCase().trim() : null,
      coupon_id:         couponId,
      coupon_discount:   discount,
      original_price:    originalPrice,
      final_price:       finalPrice,
      payment_status:    "pending",
      status:            "pending_payment",
      distance_category: leadParticipant.distance_category ?? null,
      tshirt_size:       leadParticipant.tshirt_size ?? null,
      custom_fields:     multiCustomFields,
      participant_count: participants.length,
    }, { onConflict: "event_id,user_email", ignoreDuplicates: false });
  if (regErr2) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Claim coupon atomically at reservation time (same pattern as single-participant paid path).
  if (couponId) {
    const { data: existingUse } = await db
      .from("coupon_uses")
      .select("id")
      .eq("coupon_id", couponId)
      .eq("used_by_email", accountEmail)
      .maybeSingle();

    if (existingUse) {
      const isRetry = existing != null && existing.payment_status === "pending";
      if (!isRetry) {
        return NextResponse.json({ error: "You have already used this coupon." }, { status: 400 });
      }
    } else {
      const { redeemCoupon } = await import("@/lib/coupon-redeem");
      const claimed = await redeemCoupon(couponId, accountEmail).catch(() => false);
      if (claimed === false) {
        await db.from("event_registrations").delete().eq("registration_code", code);
        return NextResponse.json({ error: "This coupon has just reached its usage limit. Please register without the coupon." }, { status: 409 });
      }
    }
  }

  const { data: pendingReg } = await db
    .from("event_registrations")
    .select("id")
    .eq("registration_code", code)
    .single();

  // Pre-create participant rows in pending state (QR assigned on payment).
  // Only insert if no participant rows exist yet for this registration
  // (handles re-attempts on the same pending registration gracefully).
  if (pendingReg?.id) {
    const { count } = await db
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", pendingReg.id);
    if (!count || count === 0) {
      const pendingRows = participants.map(p => ({
        event_id:          event_id as string,
        registration_id:   pendingReg.id,
        account_email:     accountEmail,
        first_name:        p.first_name.trim(),
        last_name:         p.last_name?.trim() || null,
        gender:            p.gender || null,
        dob:               p.date_of_birth || null,
        blood_group:       p.blood_group || null,
        mobile:            p.mobile || null,
        email:             p.email?.toLowerCase().trim() || accountEmail,
        distance_category: p.distance_category ?? null,
        tshirt_size:       p.tshirt_size ?? null,
        status:            "pending_payment",
      }));
      await db.from("event_participants").insert(pendingRows);
    }
  }

  return NextResponse.json({
    success: true,
    free: false,
    requires_payment: true,
    registration_code: code,
    original_price: originalPrice,
    coupon_discount: discount,
    final_price: finalPrice,
    participant_count: participants.length,
  });
}
