import { NextResponse } from "next/server";

// A move to a cheaper category is a refund request, and participant refund requests are no longer available. Refunds
// are decided and processed only by an authorized administrator. This route reads nothing and writes nothing.
const GONE = {
  error: "Lower-priced categories can't be chosen online.",
  code: "DOWNGRADE_DISCONTINUED",
};

export async function POST() {
  return NextResponse.json(GONE, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
