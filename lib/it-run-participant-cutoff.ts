/**
 * The single participant cutoff for IT Run Sprint-2.
 *
 * Participants may cancel, change category, and request refunds until 15 January 2027 inclusive, in IST.
 * From 16 January 2027 00:00:00 IST they cannot. Admins are not affected: the admin refund workflow for
 * previously submitted requests keeps working.
 *
 * Every participant-facing change route calls participantChangesOpen(). It reads the server clock, never a
 * value from the request. Tests control the clock by spying on Date.now().
 */

/** The first moment participant changes are closed: 16 January 2027, 00:00:00 IST. */
export const PARTICIPANT_CHANGES_CLOSE_AT = "2027-01-16T00:00:00+05:30";
export const PARTICIPANT_CHANGES_CLOSE_MS = Date.parse(PARTICIPANT_CHANGES_CLOSE_AT);

export const CUTOFF_CLOSED_CODE = "CHANGES_CLOSED";
export const CUTOFF_CLOSED_MESSAGE =
  "Cancellations, category changes and new refund requests closed on 15 January 2027 (IST). Your registration details, QR codes and payment history are still available.";

/** True while participant changes are still allowed. The last open moment is 15 January 2027, 23:59:59.999 IST. */
export function participantChangesOpen(nowMs: number = Date.now()): boolean {
  return nowMs < PARTICIPANT_CHANGES_CLOSE_MS;
}

/** The response every closed participant route returns. Same shape everywhere so the UI can show one message. */
export function participantChangesClosedBody(): { error: string; code: string } {
  return { error: CUTOFF_CLOSED_MESSAGE, code: CUTOFF_CLOSED_CODE };
}
