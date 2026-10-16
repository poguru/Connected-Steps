/**
 * BIB Name is required at the participant-details step, for every participant, before verification, review or payment.
 */

import fs from "fs";
import path from "path";
import { checkBibName, firstBibNameProblem, labelParticipantMessage } from "@/lib/it-run-name-validation";

const ROOT = path.resolve(__dirname, "../..");

describe("BIB Name rules", () => {
  it("an empty BIB name is required", () => {
    expect(checkBibName("")).toEqual({ ok: false, message: "BIB Name is required." });
  });

  it("a whitespace-only BIB name is treated as empty", () => {
    expect(checkBibName("   ")).toEqual({ ok: false, message: "BIB Name is required." });
  });

  it("a valid BIB name passes", () => {
    expect(checkBibName("ASHA RAO").ok).toBe(true);
  });
});

describe("firstBibNameProblem", () => {
  it("returns nothing when every participant has a valid BIB name", () => {
    expect(firstBibNameProblem(["ASHA", "RAVI"])).toBeNull();
  });

  it("finds a missing name for participant 2 even when participant 1 is valid", () => {
    expect(firstBibNameProblem(["ASHA", ""])).toEqual({ index: 1, message: "BIB Name is required." });
  });

  it("reports the first of several missing names, so the participant can be sent there", () => {
    expect(firstBibNameProblem(["", "   ", "RAVI"])).toEqual({ index: 0, message: "BIB Name is required." });
    expect(firstBibNameProblem(["ASHA", "", ""])?.index).toBe(1);
  });

  it("treats a missing value (not a string) as a missing name", () => {
    expect(firstBibNameProblem([undefined as unknown as string])).toEqual({ index: 0, message: "BIB Name is required." });
  });

  it("clears once the name is corrected", () => {
    expect(firstBibNameProblem(["ASHA", ""])).not.toBeNull();
    expect(firstBibNameProblem(["ASHA", "RAVI"])).toBeNull();
  });
});

describe("labelParticipantMessage", () => {
  it("names the participant when there are several", () => {
    expect(labelParticipantMessage(1, 3, "BIB Name is required.")).toBe("Participant 2: BIB Name is required.");
  });

  it("leaves a single participant's message as it is", () => {
    expect(labelParticipantMessage(0, 1, "BIB Name is required.")).toBe("BIB Name is required.");
  });
});

describe("the BIB name is enforced before payment, in the page and the API", () => {
  it("the details step checks every participant before moving on", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/register/page.tsx"), "utf8");
    expect(page).toMatch(/function bibNamesReady\(\): boolean/);
    expect(page).toMatch(/function handleParticipantNext\(\) \{[\s\S]*?bibNamesReady\(\)/);
  });

  it("submitting checks every participant before anything is saved or created", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/register/page.tsx"), "utf8");
    const submit = page.slice(page.indexOf("async function submitRegistration()"));
    const guardAt = submit.indexOf("bibNamesReady()");
    const saveAt = submit.indexOf("saveProgress({ step: 5 })");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(saveAt);
  });

  it("a resumed draft past the details step is sent back to a missing BIB name", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/it-run/register/page.tsx"), "utf8");
    expect(page).toMatch(/firstBibNameProblem\(restored\.map\(p => p\.bibName\)\)/);
  });

  it("the API still rejects a missing BIB name", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/it-run/register/route.ts"), "utf8");
    expect(route).toMatch(/checkBibName\(p\.bibName\)/);
    expect(route).toMatch(/err\("bibName", bib\.message\)/);
  });
});
