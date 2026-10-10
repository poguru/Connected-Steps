/**
 * Registration wizard: every step change saves first and moves only after the server confirms.
 * Covers the save-then-move gate, retries that use current details, double taps, the status line,
 * and the draft key that decides whether the page shows "Saved" or "Unsaved changes".
 */

import fs from "fs";
import path from "path";
import { draftKeyOf, saveStatusFor, saveThenNavigate, createMoveGate } from "@/lib/it-run-step-save";

const fmt = (ms: number) => `T${ms}`;

// ── Save, then move ───────────────────────────────────────────────────────────

describe("saveThenNavigate", () => {
  it("moves when the save succeeds", async () => {
    const navigate = jest.fn();
    const moved = await saveThenNavigate(async () => true, navigate);
    expect(moved).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("does not move when the save fails, so the participant stays on the current step", async () => {
    const navigate = jest.fn();
    const moved = await saveThenNavigate(async () => false, navigate);
    expect(moved).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("createMoveGate", () => {
  it("moves once after a confirmed save", async () => {
    const gate = createMoveGate();
    const save = jest.fn(async () => true);
    const navigate = jest.fn();
    await gate.run({ step: 3 }, save, navigate);
    expect(save).toHaveBeenCalledWith({ step: 3 });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(gate.hasPending()).toBe(false);
  });

  it("blocks a failed save from moving and keeps the move for a retry", async () => {
    const gate = createMoveGate();
    const navigate = jest.fn();
    const ok = await gate.run({ step: 4 }, async () => false, navigate);
    expect(ok).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(gate.hasPending()).toBe(true);
  });

  it("refuses a second move while one is in flight (rapid taps save and move once)", async () => {
    const gate = createMoveGate();
    let release!: (v: boolean) => void;
    const save = jest.fn(() => new Promise<boolean>(r => { release = r; }));
    const navigate = jest.fn();
    const first = gate.run({ step: 2, participantSubIdx: 1 }, save, navigate);
    const second = await gate.run({ step: 2, participantSubIdx: 1 }, save, navigate);
    expect(second).toBe(false);
    release(true);
    await first;
    expect(save).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("a retry runs the failed move once, with the save function it is given (current details)", async () => {
    const gate = createMoveGate();
    const navigate = jest.fn();
    await gate.run({ step: 5 }, async () => false, navigate);
    const currentSave = jest.fn(async () => true);
    const retried = gate.retry(currentSave);
    expect(retried).not.toBeNull();
    await retried;
    expect(currentSave).toHaveBeenCalledWith({ step: 5 });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(gate.hasPending()).toBe(false);
  });

  it("a retry with nothing waiting does nothing", () => {
    const gate = createMoveGate();
    expect(gate.retry(async () => true)).toBeNull();
  });

  it("a failed retry keeps the move waiting", async () => {
    const gate = createMoveGate();
    const navigate = jest.fn();
    await gate.run({ step: 3 }, async () => false, navigate);
    await gate.retry(async () => false);
    expect(navigate).not.toHaveBeenCalled();
    expect(gate.hasPending()).toBe(true);
  });
});

// ── Draft key: what counts as "the same details" ──────────────────────────────

const PARENT = { firstName: "Asha", lastName: "Rao", bibName: "ASHA RAO", companyIdFile: new Blob() };
const CHILD = { firstName: "Ravi", lastName: "Rao", bibName: "RAVI RAO", companyIdFile: null };

describe("draftKeyOf", () => {
  it("is the same for the same details, and ignores the non-serialisable file", () => {
    const a = draftKeyOf("cat-1", "", [PARENT, CHILD]);
    const b = draftKeyOf("cat-1", "", [{ ...PARENT, companyIdFile: null }, CHILD]);
    expect(a).toBe(b);
  });

  it("changes when a parent's value changes, and not when only the step changes", () => {
    const base = draftKeyOf("cat-1", "", [PARENT, CHILD]);
    expect(draftKeyOf("cat-1", "", [{ ...PARENT, bibName: "ASHA R" }, CHILD])).not.toBe(base);
  });

  it("keeps parent and child separate: changing the child does not look like changing the parent", () => {
    const base = draftKeyOf("cat-1", "", [PARENT, CHILD]);
    expect(draftKeyOf("cat-1", "", [PARENT, { ...CHILD, firstName: "Rav" }])).not.toBe(base);
    // Swapping the two would be a change: each participant keeps their own record
    expect(draftKeyOf("cat-1", "", [CHILD, PARENT])).not.toBe(base);
  });

  it("changes with the category and the coupon", () => {
    const base = draftKeyOf("cat-1", "", [PARENT]);
    expect(draftKeyOf("cat-2", "", [PARENT])).not.toBe(base);
    expect(draftKeyOf("cat-1", "SAVE10", [PARENT])).not.toBe(base);
  });
});

// ── Status line ───────────────────────────────────────────────────────────────

describe("saveStatusFor", () => {
  const base = { state: "idle" as const, error: "", savedAt: null, dirty: false, hasContent: true, offline: false };

  it("shows Saving while a request is in flight", () => {
    expect(saveStatusFor({ ...base, state: "saving", dirty: true }, fmt)).toEqual({ text: "Saving…", tone: "pending" });
  });

  it("shows the error and never 'Saved' after a failed save", () => {
    const s = saveStatusFor({ ...base, state: "error", error: "No connection." }, fmt);
    expect(s.tone).toBe("error");
    expect(s.text).toBe("No connection.");
  });

  it("shows Unsaved changes whenever the details differ from the last confirmed copy", () => {
    const s = saveStatusFor({ ...base, savedAt: 1000, dirty: true }, fmt);
    expect(s.text).toBe("Unsaved changes");
    expect(s.tone).toBe("pending");
  });

  it("shows Saved with the time only after the server has confirmed the current details", () => {
    expect(saveStatusFor({ ...base, savedAt: 1700 }, fmt)).toEqual({ text: "Saved at T1700", tone: "ok" });
  });

  it("does not claim anything is saved before something has been entered", () => {
    expect(saveStatusFor({ ...base, hasContent: false }, fmt)).toEqual({ text: "Nothing to save yet", tone: "muted" });
  });

  it("says when an unsaved change is only on this device", () => {
    expect(saveStatusFor({ ...base, dirty: true, offline: true }, fmt).text).toContain("kept on this device only");
  });
});

// ── The wizard uses the gate on every move ────────────────────────────────────

describe("registration wizard wiring", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "..", "app/it-run/register/page.tsx"), "utf8");

  it("the step moves that go through the save are the Back, Next and review actions", () => {
    for (const fn of ["handleParticipantBack", "handleCompanyNext", "handleParticipantNext", "addParticipant",
      "editParticipant", "editVerification", "editCategory", "editCoupon"]) {
      const body = page.slice(page.indexOf(`function ${fn}`), page.indexOf(`function ${fn}`) + 900);
      expect(body).toContain("persistThen(");
    }
  });

  it("the step screens' Back and Next buttons save before moving", () => {
    expect(page).toMatch(/onBack=\{\(\) => void persistThen\(\{ step: 3 \}/);
    expect(page).toMatch(/onNext=\{\(\) => void persistThen\(\{ step: 5 \}/);
    expect(page).toMatch(/onBack=\{\(\) => void persistThen\(\{ step: 4 \}/);
    expect(page).toMatch(/onSaveAndReturn=\{\(\) => void persistThen\(\{ step: 4 \}/);
  });

  it("payment does not begin until the details are saved", () => {
    const body = page.slice(page.indexOf("async function submitRegistration"), page.indexOf("async function submitRegistration") + 400);
    expect(body).toMatch(/if \(!\(await saveProgress\(\{ step: 5 \}\)\)\) return;/);
  });

  it("the step screens are disabled while a save is in flight", () => {
    expect(page).toMatch(/<fieldset disabled=\{serverSave === "saving"\}/);
  });

  it("the status line is driven by the server-confirmed state, not a fixed text", () => {
    expect(page).toContain("saveStatusFor({");
    expect(page).not.toContain("Not saved to server yet");
  });

  it("a restored draft is recorded as saved, so it does not show Unsaved changes", () => {
    expect(page).toMatch(/setSavedKey\(draftKeyOf\(cat\.id, d\.couponCode \?\? "", restored\)\)/);
  });
});
