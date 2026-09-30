import { expect, APIResponse } from "@playwright/test";

/** Asserts response is OK (2xx) and returns parsed JSON. */
export async function expectOk(res: APIResponse): Promise<unknown> {
  expect(res.status(), `Expected 2xx, got ${res.status()} — body: ${await res.text()}`).toBeGreaterThanOrEqual(200);
  expect(res.status(), `Expected 2xx, got ${res.status()}`).toBeLessThan(300);
  return res.json();
}

/** Asserts response has exact status and returns parsed JSON. */
export async function expectStatus(res: APIResponse, status: number): Promise<unknown> {
  expect(res.status(), `Expected ${status}, got ${res.status()} — body: ${await res.text()}`).toBe(status);
  return res.json();
}

/** Asserts a registration response has required fields and returns typed object. */
export async function expectRegistrationCreated(res: APIResponse): Promise<{
  registrationId: string;
  registrationCode: string;
  finalPrice: number;
  participantIds: string[];
}> {
  const body = await expectOk(res) as Record<string, unknown>;
  expect(body.registrationId).toBeTruthy();
  expect(body.registrationCode).toMatch(/^ITRUN2-[A-Z2-9]{8}$/);
  expect(typeof body.finalPrice).toBe("number");
  expect(Array.isArray(body.participantIds)).toBe(true);
  return body as {
    registrationId: string;
    registrationCode: string;
    finalPrice: number;
    participantIds: string[];
  };
}

/** Asserts that an error response contains the expected message fragment. */
export async function expectError(res: APIResponse, status: number, messageFrag?: string): Promise<void> {
  await expectStatus(res, status);
  if (messageFrag) {
    const body = await res.json() as { error?: string };
    expect(body.error ?? "").toContain(messageFrag);
  }
}
