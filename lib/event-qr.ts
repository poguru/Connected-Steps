import crypto from "crypto";

function SECRET(): string {
  const s = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("COACH_TOKEN_SECRET or ADMIN_PASSWORD must be set");
  return s;
}

// Signs a QR token for an event registration.
// Token encodes only registration_code + event_id — no PII.
// Format: base64url(registration_code:event_id).hmac_sha256
export function signEventQR(registrationCode: string, eventId: string): string {
  const payload = `${registrationCode}:${eventId}`;
  const hmac    = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${hmac}`;
}

// Verifies and decodes a QR token. Returns null if invalid or tampered.
export function verifyEventQR(token: string): { registrationCode: string; eventId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const hmac       = token.slice(dot + 1);
  try {
    const payload  = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");
    if (expected.length !== hmac.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) return null;
    const colon = payload.indexOf(":");
    if (colon < 1) return null;
    const registrationCode = payload.slice(0, colon);
    const eventId          = payload.slice(colon + 1);
    if (!registrationCode || !eventId) return null;
    return { registrationCode, eventId };
  } catch {
    return null;
  }
}
