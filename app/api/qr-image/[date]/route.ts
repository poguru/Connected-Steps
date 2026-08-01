// GET /api/qr-image/[date]
// Public endpoint — returns the PNG QR code for the given date.
// Used as the <img src="..."> URL in daily attendance QR emails so Gmail and
// every other email client can render it without CID/inline-image support.
// The token is regenerated from the most-recently-generated QR for that date.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer }         from "@/lib/supabase-server";
import QRCode                        from "qrcode";

import { APP_URL } from "@/lib/config";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const { date } = await params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new NextResponse("Invalid date", { status: 400 });
    }

    const db = getSupabaseServer();

    // Return the latest QR for this date (active or superseded — the image is
    // still useful even for expired QRs; the scan endpoint enforces expiry).
    const { data: qr } = await db
      .from("daily_attendance_qr")
      .select("token")
      .eq("date", date)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!qr) {
      return new NextResponse("No QR found for this date", { status: 404 });
    }

    const scanUrl = `${APP_URL}/scan?token=${qr.token}&src=daily`;
    const buffer  = await QRCode.toBuffer(scanUrl, {
      width:                400,
      margin:               2,
      errorCorrectionLevel: "H",
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":  "image/png",
        // Cache for 1 hour; stale-while-revalidate covers email clients that
        // re-fetch the image multiple times.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[qr-image]", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}
