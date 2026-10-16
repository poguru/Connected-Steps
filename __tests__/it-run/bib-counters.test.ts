/**
 * BIB collection counters: label rules, admin-only management, staff see only enabled counters, and a disabled counter
 * is refused at collection.
 */

import fs from "fs";
import path from "path";
import { normalizeCounterLabel, COUNTER_LABEL_MAX } from "@/lib/it-run-bib-counters";

const ROOT = path.resolve(__dirname, "../..");

describe("normalizeCounterLabel", () => {
  it("accepts a simple label and trims it", () => {
    expect(normalizeCounterLabel("  Counter 1 ")).toEqual({ ok: true, label: "Counter 1" });
  });

  it("collapses repeated spaces", () => {
    expect(normalizeCounterLabel("Gate    2")).toEqual({ ok: true, label: "Gate 2" });
  });

  it("refuses an empty or blank label", () => {
    expect(normalizeCounterLabel("")).toMatchObject({ ok: false });
    expect(normalizeCounterLabel("   ")).toMatchObject({ ok: false });
    expect(normalizeCounterLabel(undefined)).toMatchObject({ ok: false });
  });

  it("refuses a label longer than the limit", () => {
    expect(normalizeCounterLabel("A".repeat(COUNTER_LABEL_MAX + 1))).toMatchObject({ ok: false });
    expect(normalizeCounterLabel("A".repeat(COUNTER_LABEL_MAX))).toMatchObject({ ok: true });
  });

  it("refuses symbols that do not belong on a staff screen", () => {
    expect(normalizeCounterLabel("<script>")).toMatchObject({ ok: false });
    expect(normalizeCounterLabel("Counter;DROP")).toMatchObject({ ok: false });
  });

  it("accepts the punctuation a counter name may use", () => {
    expect(normalizeCounterLabel("Hall A & B (north)")).toEqual({ ok: true, label: "Hall A & B (north)" });
  });
});

describe("the counter API and the collection route", () => {
  const api = () => fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/bib-counters/route.ts"), "utf8");
  const collect = () => fs.readFileSync(path.join(ROOT, "app/api/it-run/admin/bib-collect/route.ts"), "utf8");

  it("only event admins create, rename or enable/disable counters", () => {
    const src = api();
    expect(src).toMatch(/export async function POST[\s\S]*?requireRole\(req, \["event_admin"\]\)/);
    expect(src).toMatch(/export async function PATCH[\s\S]*?requireRole\(req, \["event_admin"\]\)/);
  });

  it("collection staff see only enabled counters", () => {
    const src = api();
    expect(src).toMatch(/session\.role !== "event_admin"\) query = query\.eq\("is_enabled", true\)/);
  });

  it("a collection at a disabled counter is refused", () => {
    expect(collect()).toMatch(/COUNTER_DISABLED/);
    expect(collect()).toMatch(/if \(!counter\.is_enabled\)/);
  });

  it("the counter table is server-only (deny-all RLS)", () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261024000002_bib_counters.sql"), "utf8");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FOR ALL USING \(false\) WITH CHECK \(false\)/);
  });
});
