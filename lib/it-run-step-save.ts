/**
 * Save-before-navigate for the IT Run registration wizard.
 *
 * Every step change first saves the entered details to the server draft and moves only when the server
 * confirms. The status line shows "Saved" only after that confirmation, and "Unsaved changes" whenever the
 * entered details differ from the last confirmed copy.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * A stable key for the details that the draft saves. Two keys are equal exactly when the same draft content
 * would be saved. Step and participant index are excluded, because navigation alone does not change details.
 */
export function draftKeyOf(
  categoryId: string | null,
  couponCode: string,
  participants: ReadonlyArray<object>,
): string {
  return JSON.stringify({
    categoryId,
    couponCode,
    participants: participants.map(p => ({ ...(p as Record<string, unknown>), companyIdFile: null })),
  });
}

export interface SaveStatusInput {
  state: SaveState;
  error: string;
  savedAt: number | null;
  /** Current details differ from the last server-confirmed copy */
  dirty: boolean;
  /** Something has been entered, so there is something to save */
  hasContent: boolean;
  offline: boolean;
}

export interface SaveStatus {
  text: string;
  tone: "ok" | "pending" | "error" | "muted";
}

export function saveStatusFor(input: SaveStatusInput, formatTime: (ms: number) => string): SaveStatus {
  if (input.state === "saving") return { text: "Saving…", tone: "pending" };
  if (input.state === "error") return { text: input.error || "Not saved. Please try again.", tone: "error" };
  if (input.dirty) {
    return {
      text: input.offline ? "Unsaved changes. Offline: kept on this device only" : "Unsaved changes",
      tone: "pending",
    };
  }
  if (input.savedAt !== null) return { text: `Saved at ${formatTime(input.savedAt)}`, tone: "ok" };
  return { text: input.hasContent ? "Unsaved changes" : "Nothing to save yet", tone: input.hasContent ? "pending" : "muted" };
}

/**
 * Saves, then navigates only if the save succeeded. A failed save leaves the participant on the current step,
 * and the caller keeps the entered values. Returns whether navigation happened.
 */
export async function saveThenNavigate(save: () => Promise<boolean>, navigate: () => void): Promise<boolean> {
  const saved = await save();
  if (saved) navigate();
  return saved;
}

/**
 * Runs one step move at a time. A move that is already in flight refuses a second one (double taps). A move
 * whose save fails is remembered, and retry() repeats it with the save function the caller supplies, so a
 * retry always saves the current details, never a copy captured before the failure.
 */
export function createMoveGate() {
  let busy = false;
  let pending: { target: unknown; navigate: () => void } | null = null;

  async function run<T>(target: T, save: (t: T) => Promise<boolean>, navigate: () => void): Promise<boolean> {
    if (busy) return false;
    busy = true;
    try {
      const ok = await save(target);
      if (ok) {
        pending = null;
        navigate();
      } else {
        pending = { target, navigate };
      }
      return ok;
    } finally {
      busy = false;
    }
  }

  return {
    run,
    /** Repeats the failed move. Returns null when no move is waiting to be retried. */
    retry<T>(save: (t: T) => Promise<boolean>): Promise<boolean> | null {
      if (!pending) return null;
      const p = pending as { target: T; navigate: () => void };
      return run(p.target, save, p.navigate);
    },
    hasPending: () => pending !== null,
  };
}
