/**
 * v1 API authentication middleware.
 *
 * Accepts:
 *   Authorization: Bearer cs_live_<key>
 *   X-API-Key: cs_live_<key>
 *
 * Returns a V1Context (resolved key + org) or a NextResponse 401/403.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, hasScope, scopeError, logApiUsage, type ApiKeyScope, type ResolvedApiKey } from "@/lib/api-key";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface V1Context {
  key:             ResolvedApiKey;
  organization_id: string;
  startedAt:       number;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function v1Error(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const V1_ERRORS = {
  unauthorized: () => v1Error("UNAUTHORIZED",   "Invalid or missing API key.",              401),
  expired:      () => v1Error("UNAUTHORIZED",   "API key has expired.",                     401),
  forbidden:    (s: ApiKeyScope) => NextResponse.json(scopeError(s), { status: 403 }),
  notFound:     (r: string) => v1Error("NOT_FOUND",     `${r} not found.`,                 404),
  badRequest:   (m: string) => v1Error("BAD_REQUEST",   m,                                 400),
  rateLimit:    () => v1Error("RATE_LIMITED",   "Too many requests. Please slow down.",     429),
  internal:     () => v1Error("INTERNAL_ERROR", "An unexpected error occurred.",            500),
};

// ── Pagination helpers ────────────────────────────────────────────────────────

export interface PaginationParams {
  page:     number;
  per_page: number;
  offset:   number;
}

export function parsePagination(req: NextRequest): PaginationParams {
  const url      = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get("page")     ?? "1",  10) || 1);
  const per_page = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "20", 10) || 20));
  return { page, per_page, offset: (page - 1) * per_page };
}

export function v1Paginated<T>(
  data:     T[],
  total:    number,
  params:   PaginationParams,
  status = 200,
): NextResponse {
  return NextResponse.json(
    {
      data,
      meta: {
        total,
        page:     params.page,
        per_page: params.per_page,
        pages:    Math.ceil(total / params.per_page),
      },
    },
    { status },
  );
}

export function v1Single<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

// ── Auth resolution ───────────────────────────────────────────────────────────

/**
 * Resolves the API key from the request. Returns V1Context or null.
 * Does NOT log usage — call finishV1Request() after handling.
 */
export async function resolveV1Auth(req: NextRequest): Promise<V1Context | null> {
  const authHeader = req.headers.get("authorization");
  const apiKeyHdr  = req.headers.get("x-api-key");

  let rawKey: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7).trim();
  } else if (apiKeyHdr) {
    rawKey = apiKeyHdr.trim();
  }

  if (!rawKey) return null;

  const key = await verifyApiKey(rawKey);
  if (!key) return null;

  return {
    key,
    organization_id: key.organization_id,
    startedAt:       Date.now(),
  };
}

/**
 * Full auth + scope check. Returns ctx or an error NextResponse.
 * Call once per route handler.
 */
export async function requireV1Auth(
  req:      NextRequest,
  required: ApiKeyScope,
): Promise<V1Context | NextResponse> {
  const ctx = await resolveV1Auth(req);
  if (!ctx) return V1_ERRORS.unauthorized();
  if (!hasScope(ctx.key, required)) return V1_ERRORS.forbidden(required);
  return ctx;
}

/**
 * Logs usage after the response is built. Fire-and-forget.
 */
export function finishV1Request(
  ctx:        V1Context,
  req:        NextRequest,
  statusCode: number,
): void {
  logApiUsage({
    api_key_id:      ctx.key.id,
    organization_id: ctx.organization_id,
    endpoint:        new URL(req.url).pathname,
    method:          req.method,
    status_code:     statusCode,
    latency_ms:      Date.now() - ctx.startedAt,
  }).catch(() => {});
}

// ── Filter / sort helpers ─────────────────────────────────────────────────────

export function parseFilters(req: NextRequest, allowed: string[]): Record<string, string> {
  const url     = new URL(req.url);
  const filters: Record<string, string> = {};
  for (const key of allowed) {
    const val = url.searchParams.get(key);
    if (val !== null && val !== "") filters[key] = val;
  }
  return filters;
}

type SortDir = "asc" | "desc";
export function parseSort(
  req:          NextRequest,
  allowed:      string[],
  defaultCol:   string,
  defaultDir:   SortDir = "desc",
): { column: string; dir: SortDir } {
  const url    = new URL(req.url);
  const sort   = url.searchParams.get("sort")  ?? defaultCol;
  const dir    = url.searchParams.get("order") ?? defaultDir;
  return {
    column: allowed.includes(sort) ? sort : defaultCol,
    dir:    dir === "asc" ? "asc" : "desc",
  };
}
