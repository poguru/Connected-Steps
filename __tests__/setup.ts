/**
 * Jest global setup — stubs Next.js server APIs that are unavailable
 * outside the Next.js runtime environment.
 *
 * `after()` from next/server schedules post-response work. In tests there
 * is no server context, so we replace it with an immediate synchronous call
 * so the callback still runs (making tests verify the callback logic) without
 * crashing due to missing runtime infrastructure.
 */
jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    // Run the callback immediately and synchronously so tests can verify
    // that the handler was called, without needing a real Next.js runtime.
    after: jest.fn().mockImplementation((fn: () => Promise<void>) => {
      // Fire-and-forget — same semantics as production, minus the runtime guarantee
      void fn().catch(() => {});
    }),
  };
});
