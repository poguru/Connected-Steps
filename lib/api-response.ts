/**
 * Typed API response helpers for Next.js route handlers.
 *
 * Provides a consistent JSON envelope across all API routes so clients
 * can rely on a predictable shape for error handling and logging.
 *
 * Usage:
 *   return apiOk({ user })
 *   return apiError("Not found", 404)
 *   return apiUnauthorized()
 *   return apiValidationError("email is required")
 */

import { NextResponse } from "next/server";

// ── Error responses ───────────────────────────────────────────────────────────

export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiUnauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function apiForbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function apiNotFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function apiValidationError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function apiServerError(message = "Internal server error"): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function apiServiceUnavailable(message = "Service unavailable"): NextResponse {
  return NextResponse.json({ error: message }, { status: 503 });
}

// ── Success responses ─────────────────────────────────────────────────────────

export function apiOk<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiCreated<T extends Record<string, unknown>>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
