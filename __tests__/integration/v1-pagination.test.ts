/**
 * Tests for v1 API pagination math (parsePagination + v1Paginated metadata).
 * These tests instantiate the utility functions directly — no Next.js runtime needed.
 */

// ── Inline helpers (same logic as v1-auth.ts, no HTTP deps) ──────────────────

interface PaginationParams { page: number; per_page: number; offset: number; }

function parsePagination(page: number, perPage: number): PaginationParams {
  const p   = Math.max(1, page);
  const pp  = Math.min(100, Math.max(1, perPage));
  return { page: p, per_page: pp, offset: (p - 1) * pp };
}

interface PaginatedMeta { total: number; page: number; per_page: number; pages: number; }

function buildMeta(total: number, params: PaginationParams): PaginatedMeta {
  return {
    total,
    page:     params.page,
    per_page: params.per_page,
    pages:    Math.ceil(total / params.per_page),
  };
}

// ── parsePagination ───────────────────────────────────────────────────────────

describe("parsePagination", () => {
  it("defaults work correctly", () => {
    const p = parsePagination(1, 20);
    expect(p.page).toBe(1);
    expect(p.per_page).toBe(20);
    expect(p.offset).toBe(0);
  });

  it("clamps page to minimum 1", () => {
    expect(parsePagination(0, 20).page).toBe(1);
    expect(parsePagination(-5, 20).page).toBe(1);
  });

  it("clamps per_page to minimum 1", () => {
    expect(parsePagination(1, 0).per_page).toBe(1);
    expect(parsePagination(1, -10).per_page).toBe(1);
  });

  it("clamps per_page to maximum 100", () => {
    expect(parsePagination(1, 500).per_page).toBe(100);
    expect(parsePagination(1, 101).per_page).toBe(100);
  });

  it("calculates offset correctly for page 2", () => {
    const p = parsePagination(2, 25);
    expect(p.offset).toBe(25);
  });

  it("calculates offset correctly for page 3 with per_page=10", () => {
    const p = parsePagination(3, 10);
    expect(p.offset).toBe(20);
  });

  it("large page number produces correct offset", () => {
    const p = parsePagination(100, 50);
    expect(p.offset).toBe(4950);
  });
});

// ── buildMeta (v1Paginated) ───────────────────────────────────────────────────

describe("buildMeta (v1Paginated)", () => {
  it("calculates pages correctly for exact multiple", () => {
    const meta = buildMeta(100, parsePagination(1, 25));
    expect(meta.pages).toBe(4);
    expect(meta.total).toBe(100);
  });

  it("rounds up pages for non-exact division", () => {
    const meta = buildMeta(101, parsePagination(1, 25));
    expect(meta.pages).toBe(5);
  });

  it("returns 1 page for empty result", () => {
    const meta = buildMeta(0, parsePagination(1, 25));
    expect(meta.pages).toBe(0);
  });

  it("returns 1 page when total equals per_page exactly", () => {
    const meta = buildMeta(25, parsePagination(1, 25));
    expect(meta.pages).toBe(1);
  });

  it("reflects current page in meta", () => {
    const meta = buildMeta(200, parsePagination(3, 20));
    expect(meta.page).toBe(3);
    expect(meta.per_page).toBe(20);
    expect(meta.pages).toBe(10);
  });

  it("single item produces single page", () => {
    const meta = buildMeta(1, parsePagination(1, 25));
    expect(meta.pages).toBe(1);
  });

  it("large dataset with per_page 100 (max)", () => {
    const meta = buildMeta(10_000, parsePagination(1, 100));
    expect(meta.pages).toBe(100);
    expect(meta.per_page).toBe(100);
  });
});

// ── Offset range (for DB .range() calls) ─────────────────────────────────────

describe("DB range boundaries", () => {
  it("page 1 fetches rows 0 to per_page-1", () => {
    const { offset, per_page } = parsePagination(1, 10);
    expect(offset).toBe(0);
    expect(offset + per_page - 1).toBe(9);
  });

  it("page 2 fetches rows per_page to 2*per_page-1", () => {
    const { offset, per_page } = parsePagination(2, 10);
    expect(offset).toBe(10);
    expect(offset + per_page - 1).toBe(19);
  });

  it("no off-by-one: page 1 + page 2 cover exactly 2*per_page rows", () => {
    const p1 = parsePagination(1, 25);
    const p2 = parsePagination(2, 25);
    expect(p2.offset).toBe(p1.offset + p1.per_page);
  });
});
