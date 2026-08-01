import { NextRequest, NextResponse } from "next/server";
import { verifyEventQR } from "@/lib/event-qr";
import QRCode from "qrcode";

import { APP_URL } from "@/lib/config";
// GET /api/events/qr/[token]
// Returns the QR code as a PNG image. Used in emails so email clients
// can fetch the image from a public URL (data: URLs are blocked by Gmail/Outlook).
// The token itself is HMAC-signed and contains no PII — safe to expose publicly.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Verify the token is valid before serving the QR
  const decoded = verifyEventQR(token);
  if (!decoded) {
    return new NextResponse("Invalid QR token", { status: 400 });
  }

  const appUrl = APP_URL;
  const qrContent = `${appUrl}/event-checkin?t=${encodeURIComponent(token)}`;

  const pngBuffer = await QRCode.toBuffer(qrContent, {
    type:   "png",
    width:  400,
    margin: 2,
    color:  { dark: "#000000", light: "#ffffff" },
  });

  // Next.js 16 requires Uint8Array/ArrayBuffer, not Node Buffer
  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type":  "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
