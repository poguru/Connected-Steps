import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppOTP } from "@/lib/whatsapp";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";
import { verifyUserToken } from "@/lib/admin-auth";

/**
 * POST /api/auth/send-phone-otp
 *
 * Sends a 6-digit OTP to the given phone number via Meta WhatsApp.
 *
 * Body: { phone, purpose, name? }
 *
 * purpose values:
 *   "register"     — phone must NOT already exist; OTP stored in otp_verifications
 *   "login"        — phone MUST exist; OTP stored in users.otp_hash
 *   "verify_phone" — requires x-user-token; OTP stored in users.otp_hash
 *
 * Security:
 *   - Rate limit: max 3 OTPs per 15-minute window per phone+IP
 *   - Login/verify_phone: additional per-user resend limit (max 3 per 15 min)
 *   - OTP hash: bcrypt for users-table storage, plaintext only in otp_verifications
 *   - 5-minute OTP expiry
 */

const OTP_EXPIRY_MS     = 5 * 60 * 1000;  // 5 minutes
const RESEND_MAX        = 3;
const RESEND_WINDOW_MS  = 15 * 60 * 1000; // 15 minutes

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10)                              return digits;
  if (digits.length === 12 && digits.startsWith("91"))  return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(3);
  return digits;
}

function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone: rawPhone, purpose = "register", name } = body as {
      phone:    string;
      purpose?: "register" | "login" | "verify_phone";
      name?:    string;
    };

    if (!rawPhone) return NextResponse.json({ error: "Phone number is required." }, { status: 400 });

    const phone = normalisePhone(String(rawPhone));
    if (!isValidIndianPhone(phone)) {
      return NextResponse.json({ error: "Please enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const ip = getClientIp(req);

    // ── IP + phone rate limit (shared across all purposes) ────────────────────
    const sendKey = `send-phone-otp:${ip}:${phone}`;
    if (await isRateLimited(sendKey, RESEND_MAX, RESEND_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please wait 15 minutes before requesting a new code." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    }

    const db = getSupabaseServer();

    if (purpose === "register") {
      // ── Registration: phone must not already exist ────────────────────────
      const { data: existing } = await db
        .from("users")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: "An account with this phone number already exists. Please sign in." },
          { status: 409 },
        );
      }

      // Generate & store OTP in otp_verifications (user doesn't exist yet)
      const code      = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

      await db.from("otp_verifications").delete().eq("identifier", phone).eq("type", "phone");
      const { error: insertErr } = await db.from("otp_verifications").insert({
        identifier: phone,
        type:       "phone",
        code,
        expires_at: expiresAt,
        verified:   false,
      });
      if (insertErr) {
        return NextResponse.json({ error: "Failed to create OTP. Please try again." }, { status: 500 });
      }

      // Send via Meta WhatsApp
      const waResult = await sendWhatsAppOTP(phone, code);
      if (!waResult.ok) {
        console.error(`[send-phone-otp] WA failed phone=${phone} error="${waResult.error}"`);
        return NextResponse.json(
          { error: "Failed to send OTP via WhatsApp. Please check your number and try again." },
          { status: 500 },
        );
      }

      // Log to wa_message_log (best-effort)
      void db.from("wa_message_log").insert({
        phone,
        message_id:    waResult.messageId ?? null,
        template_name: process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "cs_otp_verification",
        purpose:       "otp",
        status:        "sent",
      });

      await recordFailure(sendKey, RESEND_WINDOW_MS);
      console.log(`[send-phone-otp] register OTP sent phone=${phone}`);
      return NextResponse.json({ success: true });
    }

    if (purpose === "login") {
      // ── Login: phone must exist ───────────────────────────────────────────
      const { data: user } = await db
        .from("users")
        .select("email, first_name, otp_last_sent_at, otp_resend_count")
        .eq("phone", phone)
        .maybeSingle();
      if (!user) {
        return NextResponse.json({ error: "No account found with this phone number." }, { status: 404 });
      }

      // Per-user resend limit using users table columns
      if (user.otp_last_sent_at) {
        const windowStart = Date.now() - RESEND_WINDOW_MS;
        const lastSent    = new Date(user.otp_last_sent_at as string).getTime();
        if (lastSent >= windowStart && (user.otp_resend_count as number) >= RESEND_MAX) {
          return NextResponse.json(
            { error: "You have requested too many codes. Please wait 15 minutes." },
            { status: 429, headers: { "Retry-After": "900" } },
          );
        }
      }

      // Generate + bcrypt hash the OTP
      const code      = generateOTP();
      const hash      = await bcrypt.hash(code, 10);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();
      const now       = new Date().toISOString();

      // Check if we're still in the same window for resend_count
      const inSameWindow = user.otp_last_sent_at
        && (Date.now() - new Date(user.otp_last_sent_at as string).getTime()) < RESEND_WINDOW_MS;
      const newResendCount = inSameWindow ? (user.otp_resend_count as number) + 1 : 1;

      await db.from("users").update({
        otp_hash:         hash,
        otp_expires_at:   expiresAt,
        otp_attempts:     0,
        otp_last_sent_at: now,
        otp_resend_count: newResendCount,
      }).eq("email", user.email as string);

      const waResult = await sendWhatsAppOTP(phone, code);
      if (!waResult.ok) {
        console.error(`[send-phone-otp] WA failed phone=${phone} error="${waResult.error}"`);
        return NextResponse.json(
          { error: "Failed to send OTP via WhatsApp. Please check your number and try again." },
          { status: 500 },
        );
      }

      void db.from("wa_message_log").insert({
        phone,
        user_email:    user.email,
        message_id:    waResult.messageId ?? null,
        template_name: process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "cs_otp_verification",
        purpose:       "otp",
        status:        "sent",
      });

      await recordFailure(sendKey, RESEND_WINDOW_MS);
      console.log(`[send-phone-otp] login OTP sent phone=${phone} user=${user.email}`);
      return NextResponse.json({ success: true });
    }

    if (purpose === "verify_phone") {
      // ── Verify phone: user must be logged in ──────────────────────────────
      const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
      if (!tokenEmail) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      }

      const { data: user } = await db
        .from("users")
        .select("email, otp_last_sent_at, otp_resend_count")
        .eq("email", tokenEmail.toLowerCase())
        .maybeSingle();
      if (!user) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      // Per-user resend limit
      if (user.otp_last_sent_at) {
        const windowStart = Date.now() - RESEND_WINDOW_MS;
        const lastSent    = new Date(user.otp_last_sent_at as string).getTime();
        if (lastSent >= windowStart && (user.otp_resend_count as number) >= RESEND_MAX) {
          return NextResponse.json(
            { error: "You have requested too many codes. Please wait 15 minutes." },
            { status: 429, headers: { "Retry-After": "900" } },
          );
        }
      }

      const code      = generateOTP();
      const hash      = await bcrypt.hash(code, 10);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();
      const now       = new Date().toISOString();

      const inSameWindow = user.otp_last_sent_at
        && (Date.now() - new Date(user.otp_last_sent_at as string).getTime()) < RESEND_WINDOW_MS;
      const newResendCount = inSameWindow ? (user.otp_resend_count as number) + 1 : 1;

      await db.from("users").update({
        otp_hash:         hash,
        otp_expires_at:   expiresAt,
        otp_attempts:     0,
        otp_last_sent_at: now,
        otp_resend_count: newResendCount,
        // Also update phone if a new one was provided
        ...(rawPhone && normalisePhone(rawPhone) !== "" ? { phone } : {}),
      }).eq("email", user.email as string);

      const waResult = await sendWhatsAppOTP(phone, code);
      if (!waResult.ok) {
        console.error(`[send-phone-otp] WA failed phone=${phone} error="${waResult.error}"`);
        return NextResponse.json(
          { error: "Failed to send OTP via WhatsApp. Please check your number and try again." },
          { status: 500 },
        );
      }

      void db.from("wa_message_log").insert({
        phone,
        user_email:    user.email,
        message_id:    waResult.messageId ?? null,
        template_name: process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "cs_otp_verification",
        purpose:       "otp",
        status:        "sent",
      });

      await recordFailure(sendKey, RESEND_WINDOW_MS);
      console.log(`[send-phone-otp] verify_phone OTP sent phone=${phone} user=${user.email}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid purpose." }, { status: 400 });
  } catch (e: unknown) {
    console.error("[send-phone-otp] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
