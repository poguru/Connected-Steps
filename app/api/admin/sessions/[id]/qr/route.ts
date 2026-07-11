import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

const QR_VALID_MINUTES = 90;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

// GET — return current QR for session (admin only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_qr_codes")
    .select("token, expires_at, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return NextResponse.json({ qr: null });

  const scanUrl = `${APP_URL}/scan?token=${data.token}`;
  const dataUrl = await QRCode.toDataURL(scanUrl, {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return NextResponse.json({
    qr: { token: data.token, expires_at: data.expires_at, created_at: data.created_at, data_url: dataUrl, scan_url: scanUrl },
  });
}

// POST — generate a new QR code for session (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const expiresAt = new Date(Date.now() + QR_VALID_MINUTES * 60 * 1000).toISOString();

  // Upsert — one active QR per session (delete old, insert new)
  await db.from("session_qr_codes").delete().eq("session_id", id);

  const { data, error } = await db
    .from("session_qr_codes")
    .insert({ session_id: id, expires_at: expiresAt })
    .select("token, expires_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to create QR" }, { status: 500 });

  const scanUrl = `${APP_URL}/scan?token=${data.token}`;
  const dataUrl = await QRCode.toDataURL(scanUrl, {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return NextResponse.json({
    qr: { token: data.token, expires_at: data.expires_at, data_url: dataUrl, scan_url: scanUrl },
  });
}
