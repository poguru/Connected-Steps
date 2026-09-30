import { test as base, APIRequestContext, APIResponse, TestInfo } from "@playwright/test";

// Re-usable API context fixture for IT Run tests.
// Exports helpers for all public and admin endpoints.

export type ApiFixtures = {
  api: APIRequestContext;
  adminApi: AdminApiContext;
  /** Drop-in replacement for `request` with a per-test unique IP — avoids rate-limit bleed in
   *  specs that send many requests from the same IP in rapid succession. */
  uniqueIpRequest: APIRequestContext;
};

/** Thin wrapper around APIRequestContext with auth cookie. */
export class AdminApiContext {
  private cookie: string | null = null;

  constructor(private req: APIRequestContext) {}

  async login(email?: string, password?: string): Promise<void> {
    const e = email ?? process.env.ITR_TEST_ADMIN_EMAIL ?? "";
    const p = password ?? process.env.ITR_TEST_ADMIN_PASSWORD ?? "";
    const res = await this.req.post("/api/it-run/portal/auth", {
      data: { email: e, password: p },
    });
    if (!res.ok()) {
      throw new Error(`Admin login failed: ${res.status()} — check ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD`);
    }
    // Extract Set-Cookie header
    const setCookie = res.headers()["set-cookie"] ?? "";
    const match = setCookie.match(/it_run_portal_session=([^;]+)/);
    this.cookie = match ? `it_run_portal_session=${match[1]}` : null;
  }

  private authHeaders(): Record<string, string> {
    return this.cookie ? { Cookie: this.cookie } : {};
  }

  get(url: string, params?: Record<string, string>): Promise<APIResponse> {
    return this.req.get(url, { params, headers: this.authHeaders() });
  }

  post(url: string, data?: unknown): Promise<APIResponse> {
    return this.req.post(url, { data, headers: this.authHeaders() });
  }

  patch(url: string, data?: unknown): Promise<APIResponse> {
    return this.req.patch(url, { data, headers: this.authHeaders() });
  }

  delete(url: string): Promise<APIResponse> {
    return this.req.delete(url, { headers: this.authHeaders() });
  }

  getCookie(): string | null { return this.cookie; }
  setCookie(c: string): void { this.cookie = c; }
}

// Per-worker counter — each fixture call in this worker increments it.
// Combined with workerIndex this gives a globally unique IP per test across all workers.
let _workerTestCounter = 0;

function uniqueIpForTest(testInfo: TestInfo): string {
  const n = ++_workerTestCounter;
  // Worker 0 → 10.1.x.y, Worker 1 → 10.2.x.y, etc.
  const w = (testInfo.workerIndex % 250) + 1;
  const hi = Math.floor(n / 250) % 250 + 1;
  const lo = n % 250 + 1;
  return `10.${w}.${hi}.${lo}`;
}

export const test = base.extend<ApiFixtures>({
  api: async ({ request }, use) => {
    await use(request);
  },
  adminApi: async ({ request }, use, testInfo) => {
    if (!process.env.ITR_TEST_ADMIN_EMAIL || !process.env.ITR_TEST_ADMIN_PASSWORD) {
      testInfo.skip(true, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD in .env.test");
      await use(null as unknown as AdminApiContext);
      return;
    }
    const ctx = new AdminApiContext(request);
    await ctx.login();
    await use(ctx);
  },
  uniqueIpRequest: async ({ playwright }, use, testInfo) => {
    const ip = uniqueIpForTest(testInfo);
    const baseUrl = process.env.ITR_TEST_BASE_URL ?? "http://localhost:3000";
    const ctx = await playwright.request.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: { "x-forwarded-for": ip },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from "@playwright/test";
