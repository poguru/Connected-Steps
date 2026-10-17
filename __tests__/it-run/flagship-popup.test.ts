/**
 * The IT Run announcement: once per browsing session, never on sign-in, dashboards, checkout, payment or registration.
 */

import fs from "fs";
import path from "path";
import { popupAllowedOnPath, POPUP_SEEN_KEY } from "@/lib/it-run-featured";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("which pages show the popup", () => {
  it("shows on public pages, including a direct deep link", () => {
    expect(popupAllowedOnPath("/")).toBe(true);
    expect(popupAllowedOnPath("/running-club-hyderabad")).toBe(true);
    expect(popupAllowedOnPath("/leaderboard")).toBe(true);
    expect(popupAllowedOnPath("/community")).toBe(true);
    expect(popupAllowedOnPath("/blog/some-post")).toBe(true);
  });

  it("never shows on sign-in, dashboards, checkout, payment or registration", () => {
    for (const p of ["/auth", "/auth/callback", "/dashboard", "/dashboard/events", "/it-run", "/it-run/register",
      "/events/it-run-sprint-2", "/events/it-run-sprint-2/bib-collection/abc", "/checkout", "/payment/verify", "/pricing", "/admin/events"]) {
      expect(popupAllowedOnPath(p)).toBe(false);
    }
  });

  it("does not match a route that only starts with the same letters", () => {
    expect(popupAllowedOnPath("/authors")).toBe(true);
    expect(popupAllowedOnPath("/dashboardx")).toBe(true);
  });

  it("uses a session flag, so a new visit or session can show it again", () => {
    expect(POPUP_SEEN_KEY).toBe("cs_flagship_popup_seen");
  });
});

describe("the popup's behaviour", () => {
  const popup = read("components/FlagshipPopup.tsx");

  it("is a modal dialog with a labelled close button", () => {
    expect(popup).toMatch(/role="dialog"/);
    expect(popup).toMatch(/aria-modal="true"/);
    expect(popup).toMatch(/aria-label="Close announcement"/);
  });

  it("closes on Escape and on the backdrop, and the backdrop click does not reach the card", () => {
    expect(popup).toMatch(/e\.key === "Escape"/);
    expect(popup).toMatch(/onClick=\{close\}/);
    expect(popup).toMatch(/onClick=\{e => e\.stopPropagation\(\)\}/);
  });

  it("locks background scrolling while open and restores it", () => {
    expect(popup).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(popup).toMatch(/document\.body\.style\.overflow = previousOverflow/);
  });

  it("returns focus to where it was when it closes", () => {
    expect(popup).toMatch(/returnFocusTo\.current\?\.focus/);
  });

  it("respects reduced motion", () => {
    expect(popup).toMatch(/prefers-reduced-motion: reduce/);
  });

  it("records that it was shown, so it does not reopen on internal navigation", () => {
    expect(popup).toMatch(/alreadySeenThisSession\(\)\) return;/);
    expect(popup).toMatch(/markSeen\(\);/);
  });

  it("the Register Now button goes to the canonical route", () => {
    expect(popup).toMatch(/href=\{FEATURED_EVENT\.href\}/);
  });

  it("is mounted in the root layout and the Events page features the event", () => {
    expect(read("app/layout.tsx")).toMatch(/<FlagshipPopup \/>/);
    expect(read("app/events/page.tsx")).toMatch(/<FlagshipEvent \/>/);
  });
});
