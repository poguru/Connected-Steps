/**
 * Source-level checks for the admin Early Bird page, the admin nav link, and the refund panel's failure state.
 * This project's Jest setup has no DOM, so these read the source. Behaviour is covered by the API tests.
 */

import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("admin Early Bird page", () => {
  const page = read("app/it-run/admin/early-bird/page.tsx");

  it("calls the early bird admin API for list, create, and status changes", () => {
    expect(page).toContain('fetch("/api/it-run/admin/early-bird"');
    expect(page).toMatch(/method: "POST"/);
    expect(page).toMatch(/method: "PATCH"/);
  });

  it("offers activate, pause, and archive actions", () => {
    expect(page).toContain("Activate");
    expect(page).toContain("Pause");
    expect(page).toContain("Archive");
  });

  it("warns about overlapping offers and shows places left", () => {
    expect(page).toContain("overlaps_with");
    expect(page).toContain("quota_remaining");
  });

  it("states that times are IST and that changes do not reprice existing registrations", () => {
    expect(page).toContain("Asia/Kolkata");
    expect(page).toContain("Changing an offer never changes the price of a registration already made.");
  });
});

describe("admin nav", () => {
  it("links the Early Bird page for super_admin and event_admin only", () => {
    const layout = read("app/it-run/admin/layout.tsx");
    const line = layout.split("\n").find(l => l.includes('"/it-run/admin/early-bird"'));
    expect(line).toBeDefined();
    expect(line).toContain('roles: ["super_admin","event_admin"]');
  });
});

describe("refund panel load states", () => {
  const panel = read("app/it-run/my-registrations/RefundRequestPanel.tsx");

  it("shows an error with a retry, not an empty list, when the request fails", () => {
    expect(panel).toContain("We couldn&apos;t load your refund requests.");
    expect(panel).toContain("Try again");
    expect(panel).toContain('setListState("error")');
  });

  it("shows 'no refund requests' only in the successful state", () => {
    const line = panel.split("\n").find(l => l.includes("You have no refund requests."));
    expect(line).toBeDefined();
    expect(panel).toMatch(/listState === "ok" && requests\.length === 0/);
  });

  it("does not set the list from a failed response", () => {
    expect(panel).toMatch(/if \(!res\.ok \|\| !d \|\| !Array\.isArray\(d\.requests\)\)/);
  });
});
