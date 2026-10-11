import { NextResponse } from "next/server";

// Participant refund requests are no longer available. Refunds are decided and processed only by an authorized
// administrator (see /api/it-run/admin/refund-requests and /api/it-run/admin/refund). This route is kept only to
// answer existing clients with a clear "gone" response. It reads nothing and writes nothing, for every caller.
const GONE = {
  error: "Refund requests are no longer available here. Our team handles refunds directly.",
  code: "REFUND_REQUESTS_DISCONTINUED",
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
