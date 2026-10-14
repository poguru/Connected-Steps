/**
 * Endpoint rate limit: fixed windows, sustained traffic, concurrent requests, Redis failures and missing IP addresses.
 * Redis is replaced by a small in-memory fake that follows the same rules for the commands the limiter sends:
 * SET ... NX EX (creates a window with an expiry only when none exists), INCR (counts; keeps the expiry), and expiry by time.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the Redis fake is intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";

const MAX = 30;
const WINDOW_MS = 60_000;

// ── Redis fake ──────────────────────────────────────────────────────────────────
let clock = 0;
let store = new Map<string, { value: number; expiresAt: number | null }>();
let redisDown = false;

function purge() {
  for (const [k, v] of store) if (v.expiresAt !== null && v.expiresAt <= clock) store.delete(k);
}

function exec(cmd: any[]): { result: unknown } {
  purge();
  const [name, key, ...args] = cmd;
  if (name === "SET") {
    const ttl = Number(args[args.indexOf("EX") + 1]);
    const nx = args.includes("NX");
    if (nx && store.has(key)) return { result: null };
    store.set(key, { value: Number(args[0]), expiresAt: clock + ttl * 1000 });
    return { result: "OK" };
  }
  if (name === "INCR") {
    const cur = store.get(key);
    const next = (cur?.value ?? 0) + 1;
    store.set(key, { value: next, expiresAt: cur?.expiresAt ?? null });
    return { result: next };
  }
  throw new Error(`fake Redis does not support ${name}`);
}

function installFakeRedis() {
  jest.spyOn(globalThis, "fetch").mockImplementation((async (_url: any, init: any) => {
    if (redisDown) throw new Error("connect ECONNREFUSED");
    const commands: any[][] = JSON.parse(init.body);
    const results = commands.map(exec);
    return { ok: true, json: async () => results } as any;
  }) as any);
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
let keyCounter = 0;
const freshKey = () => `test:${++keyCounter}:${Math.random().toString(36).slice(2)}`;

async function hit(key: string) {
  return checkAndRecordEndpointLimit(key, MAX, WINDOW_MS);
}

beforeAll(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
});

beforeEach(() => {
  clock = 1_000_000;
  store = new Map();
  redisDown = false;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  installFakeRedis();
});

afterEach(() => jest.restoreAllMocks());

// ── Window expiry ───────────────────────────────────────────────────────────────
describe("fixed window", () => {
  it("allows the limit and blocks the next request in the same window", async () => {
    const key = freshKey();
    const results: boolean[] = [];
    for (let i = 0; i < MAX + 1; i++) results.push((await hit(key)).limited);
    expect(results.slice(0, MAX).every(l => l === false)).toBe(true);
    expect(results[MAX]).toBe(true);
  });

  it("the window ends one minute after it starts, whatever happens inside it", async () => {
    const key = freshKey();
    for (let i = 0; i < MAX; i++) await hit(key);
    expect((await hit(key)).limited).toBe(true);
    clock += WINDOW_MS; // exactly one window later
    expect((await hit(key)).limited).toBe(false);
  });

  it("continuous traffic does not keep the window open: the first request of the next window is allowed", async () => {
    // One request per second for two minutes. Each minute allows 30: the first 30 pass, the next 30 are blocked.
    // The old code pushed the expiry back on every request, so the second minute would have stayed blocked.
    const key = freshKey();
    const allowedAt: number[] = [];
    for (let s = 0; s < 120; s++) {
      if (!(await hit(key)).limited) allowedAt.push(s);
      clock += 1000;
    }
    expect(allowedAt.filter(s => s < 60)).toHaveLength(MAX);
    expect(allowedAt.filter(s => s >= 60)).toHaveLength(MAX);
    expect(allowedAt).toContain(60); // the first request after the window ends is allowed
  });

  it("steady traffic within the limit is never blocked over 15 minutes", async () => {
    // One request every 10 seconds: 6 a minute, well inside 30. Nothing should be blocked.
    const key = freshKey();
    let blocked = 0;
    for (let s = 0; s < 15 * 60; s += 10) {
      if ((await hit(key)).limited) blocked++;
      clock += 10_000;
    }
    expect(blocked).toBe(0);
  });

  it("the window does not expire early while it is open", async () => {
    const key = freshKey();
    for (let i = 0; i < MAX; i++) await hit(key);
    clock += WINDOW_MS - 1000; // one second before the window ends
    expect((await hit(key)).limited).toBe(true);
  });
});

// ── Concurrency ─────────────────────────────────────────────────────────────────
describe("concurrent requests", () => {
  it("50 requests at the same moment: exactly the limit is allowed", async () => {
    const key = freshKey();
    const results = await Promise.all(Array.from({ length: 50 }, () => hit(key)));
    expect(results.filter(r => !r.limited)).toHaveLength(MAX);
    expect(results.filter(r => r.limited)).toHaveLength(50 - MAX);
  });

  it("concurrent first requests create one window, not several", async () => {
    const key = freshKey();
    await Promise.all(Array.from({ length: 10 }, () => hit(key)));
    const windowStarts = [...store.keys()].filter(k => k === `ep:${key}`);
    expect(windowStarts).toHaveLength(1);
    expect(store.get(`ep:${key}`)?.value).toBe(10);
  });
});

// ── Redis errors ────────────────────────────────────────────────────────────────
describe("Redis unavailable or failing", () => {
  it("falls back to the in-memory counter when Redis is unreachable, and still enforces the limit", async () => {
    redisDown = true;
    const key = freshKey();
    const results: boolean[] = [];
    for (let i = 0; i < MAX + 1; i++) results.push((await hit(key)).limited);
    expect(results[MAX]).toBe(true);
  });

  it("falls back when Redis answers with an error status", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation((async () => ({ ok: false, json: async () => ({}) })) as any);
    const key = freshKey();
    const results: boolean[] = [];
    for (let i = 0; i < MAX + 1; i++) results.push((await hit(key)).limited);
    expect(results[MAX]).toBe(true);
  });

  it("falls back when Redis returns a command error", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation((async () => ({
      ok: true,
      json: async () => [{ result: "OK" }, { error: "WRONGTYPE" }],
    })) as any);
    const key = freshKey();
    const results: boolean[] = [];
    for (let i = 0; i < MAX + 1; i++) results.push((await hit(key)).limited);
    expect(results[MAX]).toBe(true);
  });

  it("uses the in-memory counter when Redis variables are not set", async () => {
    const saved = [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN];
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const key = freshKey();
      const fetchSpy = jest.spyOn(globalThis, "fetch");
      for (let i = 0; i < MAX + 1; i++) await hit(key);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN] = saved;
    }
  });
});

// ── Client IP ───────────────────────────────────────────────────────────────────
describe("client IP for the limit", () => {
  const req = (headers: Record<string, string>) => ({
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  });

  it("uses the first x-forwarded-for address", () => {
    expect(getClientIp(req({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    expect(getClientIp(req({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("returns 'unknown' when no address is present, which is a shared bucket and is logged as a known limitation", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
