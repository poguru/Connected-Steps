import { NextResponse } from "next/server";
import { clearRateLimitPrefix } from "@/lib/rate-limit";

// DELETE /api/test-utils/reset-rate-limits
// Clears the in-memory rate-limit store so test suites start with a clean slate.
// BLOCKED IN PRODUCTION — returns 404 to avoid accidental exposure.
export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cleared = clearRateLimitPrefix("");   // "" prefix = clear all keys
  return NextResponse.json({ ok: true, cleared });
}
