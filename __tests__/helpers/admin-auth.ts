/**
 * Test helper: creates a NextRequest with a valid cs_admin_session cookie.
 *
 * signAdminSession() uses COACH_TOKEN_SECRET ?? ADMIN_PASSWORD, so the env
 * vars must be set before calling this (typically in the test file's preamble).
 */
import { NextRequest } from "next/server";
import { signAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";

export function adminCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=${signAdminSession()}`;
}

export function makeAdminHeaders(extra?: Record<string, string>): Record<string, string> {
  return { cookie: adminCookieHeader(), ...extra };
}

export function makeAdminRequest(url: string | URL, init?: RequestInit): NextRequest {
  const headers = new Headers((init?.headers as HeadersInit) ?? {});
  headers.set("cookie", adminCookieHeader());
  return new NextRequest(url, { ...init, headers });
}
