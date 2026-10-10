import { after } from "next/server";

/**
 * Runs background work (such as sending an email) after the response has been sent, and keeps the
 * serverless function alive until it finishes. A bare un-awaited promise can be cut off once the response
 * is returned, which silently drops the work.
 *
 * Outside a request (for example in tests), runs the task directly. Failures are logged with a label only.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const run = () => task().catch(e => {
    console.error(JSON.stringify({ src: "after-response", label, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }));
  });
  try {
    after(run);
  } catch {
    void run();
  }
}
