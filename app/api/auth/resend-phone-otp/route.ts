import { type NextRequest } from "next/server";
import { POST as sendPhoneOtp } from "@/app/api/auth/send-phone-otp/route";

/**
 * POST /api/auth/resend-phone-otp
 *
 * Thin wrapper around /api/auth/send-phone-otp.
 * Accepts the same body: { phone, purpose, name? }
 *
 * Exists as a semantic alias so clients can distinguish a first send
 * from an explicit resend in logs and analytics.
 */
export async function POST(req: NextRequest) {
  return sendPhoneOtp(req);
}
