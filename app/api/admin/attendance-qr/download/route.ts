import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import QRCode from "qrcode";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://connectedsteps.in";

// GET /api/admin/attendance-qr/download?id=<qr_id>
// Returns a PNG QR image for download
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: qr, error } = await db
    .from("daily_attendance_qr")
    .select("token, date, location_id")
    .eq("id", id)
    .single();

  if (error || !qr) return NextResponse.json({ error: "QR not found" }, { status: 404 });

  const scanUrl  = `${APP_URL}/scan?token=${qr.token}&src=daily`;
  const pngBuf   = await QRCode.toBuffer(scanUrl, { type: "png", width: 512, margin: 2 });

  return new NextResponse(pngBuf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type":        "image/png",
      "Content-Disposition": `attachment; filename="attendance-qr-${qr.date}.png"`,
      "Cache-Control":       "no-store",
    },
  });
}
