import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

// GET /api/it-run/qr/[token]
// First-party QR code image endpoint.
// Generates a QR PNG server-side — replaces the external api.qrserver.com dependency.
// The token is any opaque string (HMAC-signed QR token or registration code).
// No authentication required; the token itself is the secret (HMAC-signed).
// Cache headers: 1-year immutable (QR content for a given token never changes).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!token || typeof token !== "string" || token.length > 512) {
    return new NextResponse("Invalid token", { status: 400 });
  }

  try {
    const png = await QRCode.toBuffer(decodeURIComponent(token), {
      type:   "png",
      width:  200,
      margin: 2,
      color:  { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type":  "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[it-run/qr] QRCode generation error:", e);
    return new NextResponse("QR generation failed", { status: 500 });
  }
}
