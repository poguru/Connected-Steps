/**
 * The IT Run Sprint-2 is promoted from one configuration: the navbar, footer and homepage all read it, and its link
 * goes to a route that exists.
 */

import fs from "fs";
import path from "path";
import { FEATURED_EVENT, FEATURED_EVENT_VISIBLE } from "@/lib/it-run-featured";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("the flagship event configuration", () => {
  it("links to the canonical registration route, which exists", () => {
    expect(FEATURED_EVENT.href).toBe("/it-run");
    expect(fs.existsSync(path.resolve(__dirname, "../../app/it-run/page.tsx"))).toBe(true);
  });

  it("uses the event's real logo file and tagline", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../public", FEATURED_EVENT.logo.replace(/^\//, "")))).toBe(true);
    expect(FEATURED_EVENT.tagline).toBe("Debug the routine. Run the race. Break the loop.");
  });

  it("is visible by default", () => {
    expect(FEATURED_EVENT_VISIBLE).toBe(true);
  });
});

describe("the event is promoted from one source", () => {
  it("the navbar links to it with the accent", () => {
    const nav = read("components/layout/Navbar.tsx");
    expect(nav).toMatch(/href: FEATURED_EVENT\.href,\s+label: "IT Run Sprint-2", accent: true/);
  });

  it("the footer links to it", () => {
    expect(read("components/layout/Footer.tsx")).toMatch(/href: FEATURED_EVENT\.href/);
  });

  it("the homepage shows the flagship section after the hero", () => {
    const home = read("app/HomeClient.tsx");
    expect(home.indexOf("<Hero />")).toBeLessThan(home.indexOf("<FlagshipEvent />"));
  });

  it("the section's register button uses the canonical route, not a hard-coded URL", () => {
    const section = read("components/FlagshipEvent.tsx");
    expect(section).toMatch(/href=\{FEATURED_EVENT\.href\}/);
    expect(section).not.toMatch(/connectedsteps\.in\/it-run/);
  });
});
