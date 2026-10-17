/**
 * The reservation sweep is scheduled, once a day, behind the cron check. A daily run is a backstop: payment and renewal
 * already refuse a lapsed window, so the sweep only frees seats sooner.
 */

import fs from "fs";
import path from "path";

const vercel = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};

describe("the reservation sweep schedule", () => {
  it("is scheduled daily at 03:00", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/it-run-reservations", schedule: "0 3 * * *" });
  });

  it("the job route is protected by the cron check", () => {
    const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/cron/it-run-reservations/route.ts"), "utf8");
    expect(route).toMatch(/isCronAuthorized\(req\)/);
  });
});
