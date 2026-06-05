import { CS_API_BASE } from "../config";
import type { CSUser, HealthActivity, HealthSource, PushResponse } from "../types";

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(identifier: string, password: string): Promise<CSUser> {
  const res = await fetch(`${CS_API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data.user as CSUser;
}

// ── Health activity push ───────────────────────────────────────────────────────

export async function pushActivities(
  email:      string,
  source:     HealthSource,
  activities: HealthActivity[]
): Promise<PushResponse> {
  const secret = process.env.EXPO_PUBLIC_NATIVE_PUSH_SECRET ?? "";

  const res = await fetch(`${CS_API_BASE}/api/integrations/native/push`, {
    method: "POST",
    headers: {
      "Content-Type":     "application/json",
      "X-CS-Native-Token": secret,
    },
    body: JSON.stringify({ email, source, activities }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Push failed");
  return data as PushResponse;
}

// ── Integration status ────────────────────────────────────────────────────────

export async function getIntegrations(email: string) {
  const res = await fetch(
    `${CS_API_BASE}/api/integrations?email=${encodeURIComponent(email)}`
  );
  if (!res.ok) throw new Error("Failed to load integrations");
  return res.json();
}
