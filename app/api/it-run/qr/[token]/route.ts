/**
 * GET /api/it-run/qr/[token]
 *
 * Serves the QR code PNG for a participant.
 *
 * Security:
 * - The token itself IS the credential (signed participant QR token)
 * - Returns PNG image only, no HTML/JSON
 * - Works from email clients (Gmail, Apple Mail, mobile, etc.)
 * - Cacheable (immutable after generation)
 * - No login required (token is in the URL)
 *
 * Used by: IT Run confirmation email
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic"; // Always regenerate for security

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || typeof token !== "string" || token.length < 10) {
      console.warn("[it-run-qr] Invalid token");
      return NextResponse.json({ error: "Invalid QR token" }, { status: 400 });
    }

    // Generate QR code from the token
    // The token itself encodes the participant identity (signed)
    const qrPng = await QRCode.toBuffer(token, {
      type: "png",
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });

    // Return as PNG image
    // Email clients cache this aggressively (max-age=31536000 = 1 year)
    // The token never changes, so this is safe to cache forever
    return new NextResponse(qrPng as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": qrPng.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[it-run-qr] Error:", error);
    return NextResponse.json({ error: "QR generation failed" }, { status: 500 });
  }
}
