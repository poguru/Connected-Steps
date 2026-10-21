import { registrationSource } from "../helpers/registration-source";
/**
 * Registration opens at registration_opens_at and closes at registration_closes_at. Nothing can be registered before
 * the opening time, on the page or on the server.
 */

import fs from "fs";
import path from "path";
import { registrationWindow, formatIst } from "@/lib/it-run-registration-window";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const OPENS = "2026-10-20T05:06:00.000Z"; // 10:36 AM IST
const CLOSES = "2027-01-31T18:29:00.000Z";

describe("registrationWindow", () => {
  it("is not open before the opening time", () => {
    expect(registrationWindow(OPENS, CLOSES, Date.parse("2026-10-17T08:00:00Z"))).toBe("not_open");
  });
  it("is open from the opening time until the closing time", () => {
    expect(registrationWindow(OPENS, CLOSES, Date.parse(OPENS))).toBe("open");
    expect(registrationWindow(OPENS, CLOSES, Date.parse("2026-12-01T00:00:00Z"))).toBe("open");
  });
  it("is closed from the closing time", () => {
    expect(registrationWindow(OPENS, CLOSES, Date.parse(CLOSES))).toBe("closed");
  });
  it("with no opening time set, it is open (unchanged behaviour)", () => {
    expect(registrationWindow(null, CLOSES, Date.parse("2026-10-17T08:00:00Z"))).toBe("open");
  });
});

describe("formatIst", () => {
  it("shows the opening time in Indian time", () => {
    expect(formatIst(OPENS)).toMatch(/Oct/);
    expect(formatIst(OPENS)).toMatch(/10:36/);
    expect(formatIst(OPENS)).toMatch(/IST/);
  });
});

describe("the server and the page refuse registration before it opens", () => {
  it("the register route refuses with REGISTRATION_NOT_OPEN before the closing check", () => {
    const route = registrationSource();
    expect(route).toMatch(/window === "not_open"/);
    expect(route).toMatch(/code: "REGISTRATION_NOT_OPEN"/);
    expect(route).toMatch(/registration_opens_at,registration_closes_at,event_date/);
  });

  it("the page shows the opening time and does not continue from the first step", () => {
    const page = read("app/it-run/register/page.tsx");
    expect(page).toMatch(/Registration opens on \{formatIst\(regOpensAt!\)\}/);
    expect(page).toMatch(/if \(regNotYetOpen\) return;/);
  });
});
