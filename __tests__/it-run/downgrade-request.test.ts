/**
 * Participants can no longer ask for a downgrade. A downgrade is a refund, and only an administrator decides and
 * processes refunds. The route answers 410 for every caller and writes nothing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake database is intentionally loosely typed */

import fs from "fs";
import path from "path";
import { POST } from "@/app/api/it-run/registrations/[id]/downgrade/route";

describe("POST /api/it-run/registrations/[id]/downgrade (discontinued)", () => {
  it("answers 410 with the discontinued code, for any caller", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("DOWNGRADE_DISCONTINUED");
  });

  it("does not read or write anything (no database module is loaded for it)", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/it-run/registrations/[id]/downgrade/route.ts"), "utf8");
    expect(source).not.toMatch(/getSupabaseServer|\.insert\(|\.update\(|\.rpc\(/);
  });
});
