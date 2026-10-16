/**
 * BIB desk: a BIB is issued only when the adult is company-verified (children exempt). Every other state gives a clear
 * reason, never a number that has not been allocated.
 */

import fs from "fs";
import path from "path";
import { collectionReadiness, type CollectionFacts } from "@/lib/it-run-bib-desk";

const ROOT = path.resolve(__dirname, "../..");

const READY: CollectionFacts = {
  cancelled: false, paymentStatus: "paid", participantType: "solo",
  verificationOutcome: "company_verified", bibNumber: "50001", bibCollected: false,
};

describe("collectionReadiness", () => {
  it("a company-verified adult with a BIB is ready", () => {
    expect(collectionReadiness(READY).state).toBe("ready");
  });

  it("a government-verified adult must be checked at the desk first", () => {
    expect(collectionReadiness({ ...READY, verificationOutcome: "government_verified" }).state).toBe("needs_desk_verification");
  });

  it("an adult with no outcome yet must be checked at the desk", () => {
    expect(collectionReadiness({ ...READY, verificationOutcome: null }).state).toBe("needs_desk_verification");
  });

  it("a child is exempt from the company check", () => {
    expect(collectionReadiness({ ...READY, participantType: "child", verificationOutcome: null }).state).toBe("ready");
  });

  it("a runner with no BIB number yet is told so, not given one", () => {
    const r = collectionReadiness({ ...READY, bibNumber: null });
    expect(r.state).toBe("no_bib");
    expect(r.message).toMatch(/not been allocated/);
  });

  it("a cancelled runner is never ready", () => {
    expect(collectionReadiness({ ...READY, cancelled: true }).state).toBe("cancelled");
  });

  it("a runner who already collected is not issued again", () => {
    expect(collectionReadiness({ ...READY, bibCollected: true }).state).toBe("already_collected");
  });

  it("an unpaid registration is not ready", () => {
    expect(collectionReadiness({ ...READY, paymentStatus: "pending" }).state).toBe("not_confirmed");
  });

  it("a free registration is ready like a paid one", () => {
    expect(collectionReadiness({ ...READY, paymentStatus: "free" }).state).toBe("ready");
  });
});

describe("the desk routes enforce the same rules on the server", () => {
  it("the issue route refuses anything that is not ready", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/it-run/bib-collection/route.ts"), "utf8");
    expect(src).toMatch(/if \(readiness\.state !== "ready"\)/);
    expect(src).toMatch(/COUNTER_DISABLED/);
  });

  it("the lookup returns the readiness the screen shows", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/it-run/bib-collection/route.ts"), "utf8");
    expect(src).toMatch(/withReadiness\(parts \?\? \[\]\)/);
    expect(src).toMatch(/withReadiness\(scoped\)/);
  });

  it("recording a company check at the desk uses the version guard and records the outcome", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/it-run/bib-desk/verify-company/route.ts"), "utf8");
    expect(src).toMatch(/\.eq\("verification_version", body\.expectedVersion\)/);
    expect(src).toMatch(/verification_outcome: "company_verified"/);
    expect(src).toMatch(/VERSION_CONFLICT/);
  });

  it("the desk screen shows the readiness and offers the two desk actions", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/bib/page.tsx"), "utf8");
    expect(page).toMatch(/result\.readiness\?\.state === "ready"/);
    expect(page).toMatch(/deskVerify/);
    expect(page).toMatch(/noBibCancel/);
  });
});
