/**
 * "Go home" on error screens: IT Run pages return to the IT Run event page; everything else
 * still goes to the Connected Steps homepage.
 */

import fs from "fs";
import path from "path";
import {
  errorHomeDestination,
  errorHomeLabel,
  IT_RUN_EVENT_PATH,
  SITE_HOME_PATH,
} from "@/lib/error-navigation";

describe("errorHomeDestination", () => {
  it.each([
    "/it-run",
    "/it-run/register",
    "/it-run/my-registrations",
    "/it-run/dashboard/ITR-0001",
    "/it-run/company-id",
    "/it-run/feedback",
    "/it-run/bib",
  ])("sends %s to the IT Run event page", pathname => {
    expect(errorHomeDestination(pathname)).toBe(IT_RUN_EVENT_PATH);
  });

  it.each([
    "/",
    "/my-events/abc",
    "/admin/users",
    "/itrun",
    "/it-runner",
    "/dashboard",
  ])("keeps %s on the general site homepage", pathname => {
    expect(errorHomeDestination(pathname)).toBe(SITE_HOME_PATH);
  });

  it("falls back to the homepage when the path is unknown", () => {
    expect(errorHomeDestination(null)).toBe(SITE_HOME_PATH);
    expect(errorHomeDestination(undefined)).toBe(SITE_HOME_PATH);
    expect(errorHomeDestination("")).toBe(SITE_HOME_PATH);
  });

  it("only ever returns one of two fixed internal paths (no open redirect)", () => {
    for (const hostile of ["//evil.example.com", "https://evil.example.com/it-run", "/it-run/..//evil"]) {
      expect([IT_RUN_EVENT_PATH, SITE_HOME_PATH]).toContain(errorHomeDestination(hostile));
    }
  });

  it("the IT Run event destination is a real page in the app", () => {
    const page = path.join(__dirname, "..", "..", "app", IT_RUN_EVENT_PATH, "page.tsx");
    expect(fs.existsSync(page)).toBe(true);
  });
});

describe("errorHomeLabel", () => {
  it("names the IT Run event page on IT Run routes", () => {
    expect(errorHomeLabel("/it-run/register")).toBe("IT Run event page");
  });

  it("keeps the general label elsewhere", () => {
    expect(errorHomeLabel("/my-events")).toBe("Go home");
  });
});

describe("error boundaries use the helper", () => {
  it.each(["app/error.tsx", "app/global-error.tsx"])("%s routes Go home through errorHomeDestination", file => {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");
    expect(source).toContain("errorHomeDestination");
    expect(source).not.toMatch(/window\.location\.href\s*=\s*"\/"/);
  });
});
