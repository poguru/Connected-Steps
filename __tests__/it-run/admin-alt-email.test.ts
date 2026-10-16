/**
 * Admin email destinations: primary, alternative, or both. Each address is sent once, the destination is recorded on each
 * recipient, and the admin sees the destination before sending.
 */

import fs from "fs";
import path from "path";
import { selectRecipients, type EventRunnerRow } from "@/lib/it-run-email-campaign";

const ROOT = path.resolve(__dirname, "../..");

function runner(over: Partial<EventRunnerRow>): EventRunnerRow {
  return {
    id: "p1", registration_id: "r1", first_name: "Asha", last_name: "Rao",
    email: "asha@company.com", alt_email: "asha.home@gmail.com", category_id: "c1", event_id: "e1",
    registration_category_id: "c1", payment_status: "paid", registration_status: "active", created_at: "2027-01-01T10:00:00Z",
    ...over,
  };
}

describe("selectRecipients: destination", () => {
  it("both (the default): the primary and the alternative address", () => {
    const sel = selectRecipients([runner({})], { destination: "both" });
    expect(sel.recipients.map(r => [r.email, r.addressKind])).toEqual([
      ["asha@company.com", "primary"], ["asha.home@gmail.com", "alternative"],
    ]);
  });

  it("primary only: the alternative address is not used", () => {
    const sel = selectRecipients([runner({})], { destination: "primary" });
    expect(sel.recipients.map(r => r.email)).toEqual(["asha@company.com"]);
  });

  it("alternative only: the primary address is not used", () => {
    const sel = selectRecipients([runner({})], { destination: "alternative" });
    expect(sel.recipients.map(r => r.email)).toEqual(["asha.home@gmail.com"]);
  });

  it("with no destination given, the earlier behaviour holds: the primary address only", () => {
    const sel = selectRecipients([runner({})], {});
    expect(sel.recipients.map(r => r.email)).toEqual(["asha@company.com"]);
  });

  it("a runner with no alternative address is not counted as invalid", () => {
    const sel = selectRecipients([runner({ alt_email: null })], { destination: "both" });
    expect(sel.recipients.map(r => r.email)).toEqual(["asha@company.com"]);
    expect(sel.excludedInvalid).toBe(0);
  });

  it("the same address for both is sent once", () => {
    const sel = selectRecipients([runner({ alt_email: "ASHA@company.com" })], { destination: "both" });
    expect(sel.recipients).toHaveLength(1);
    expect(sel.excludedDuplicate).toBe(1);
  });

  it("each person's own alternative address goes only to that person", () => {
    const sel = selectRecipients([
      runner({ id: "p1", email: "asha@company.com", alt_email: "asha.home@gmail.com" }),
      runner({ id: "p2", email: "ravi@company.com", alt_email: null }),
    ], { destination: "both" });
    const byPerson = (id: string) => sel.recipients.filter(r => r.participantId === id).map(r => r.email);
    expect(byPerson("p1")).toEqual(["asha@company.com", "asha.home@gmail.com"]);
    expect(byPerson("p2")).toEqual(["ravi@company.com"]);
  });
});

describe("the admin emails page and route use the destination", () => {
  it("the route reads the destination and defaults to both", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/emails/route.ts"), "utf8");
    expect(route).toMatch(/function destinationOf\(raw: unknown\): Destination \{[\s\S]*?: "both";/);
    expect(route).toMatch(/destinationOf\(body\.destination\)/);
  });

  it("the page offers the three choices and sends the chosen one with each request", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/admin/emails/page.tsx"), "utf8");
    expect(page).toMatch(/Primary and alternative address \(default\)/);
    expect(page).toMatch(/Primary address only/);
    expect(page).toMatch(/Alternative address only/);
    expect(page).toMatch(/destination,\s/);
    expect(page).toMatch(/queue_confirmation", batchId: batch, participantIds: picked, destination/);
  });
});
