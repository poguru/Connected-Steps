/**
 * Participants no longer request refunds. Refund decisions and processing stay with administrators. These checks read
 * the code: no participant screen offers a refund, the discontinued routes do nothing, and the admin refund routes are
 * still there, still admin-only, and never delete a refund or payment record.
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

function participantFiles(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, f);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) participantFiles(rel, out);
    else if (/\.(tsx?|ts)$/.test(f)) out.push(rel);
  }
  return out;
}

describe("participant screens offer no refund request", () => {
  const participantDirs = ["app/it-run/my-registrations", "app/it-run/dashboard", "app/it-run/register"];

  it("the refund request panel is gone", () => {
    expect(exists("app/it-run/my-registrations/RefundRequestPanel.tsx")).toBe(false);
    expect(read("app/it-run/my-registrations/page.tsx")).not.toMatch(/RefundRequestPanel/);
  });

  it("no participant screen mentions requesting a refund or the refund-request form", () => {
    for (const dir of participantDirs) {
      for (const file of participantFiles(dir)) {
        const text = read(file);
        expect({ file, hit: /Refund requests?\b|refund request|Request downgrade|Send request for/i.test(text) })
          .toEqual({ file, hit: false });
      }
    }
  });

  it("no participant screen calls the discontinued refund or downgrade routes", () => {
    for (const dir of participantDirs) {
      for (const file of participantFiles(dir)) {
        expect({ file, calls: /api\/it-run\/refund-requests|\/downgrade`/.test(read(file)) })
          .toEqual({ file, calls: false });
      }
    }
  });

  it("a downgrade is a plain category change: no request, no refund, and no refusal for it", () => {
    const button = read("app/it-run/my-registrations/CategoryChangeButton.tsx");
    expect(button).not.toMatch(/requestDowngrade|checkRefundReason|it-run-refund-reason/);
    const route = read("app/api/it-run/registrations/[id]/category/route.ts");
    expect(route).toMatch(/allowed: !blocked && !full,/);
    expect(route).not.toMatch(/DOWNGRADE_NOT_AVAILABLE/);
    expect(route).not.toMatch(/it_run_refund_requests|it_run_refunds/);
  });

  it("My Registrations no longer returns a refund action", () => {
    expect(read("lib/it-run-my-registrations.ts")).not.toMatch(/canRequestRefund/);
  });
});

describe("participants cannot create refund requests", () => {
  it("the participant refund-request route answers 410 and never reaches the database", () => {
    const source = read("app/api/it-run/refund-requests/route.ts");
    expect(source).toMatch(/status: 410/);
    expect(source).not.toMatch(/getSupabaseServer|\.insert\(|\.update\(|\.rpc\(/);
  });

  it("the downgrade route answers 410 and never reaches the database", () => {
    const source = read("app/api/it-run/registrations/[id]/downgrade/route.ts");
    expect(source).toMatch(/status: 410/);
    expect(source).not.toMatch(/getSupabaseServer|\.insert\(|\.update\(|\.rpc\(/);
  });
});

describe("admin refund processing is kept and stays admin-only", () => {
  const adminRoutes = [
    "app/api/it-run/admin/refund/route.ts",
    "app/api/it-run/admin/refund-requests/route.ts",
    "app/api/it-run/admin/refund-requests/[id]/route.ts",
    "app/api/it-run/admin/refund-reconciliation/route.ts",
    "app/api/it-run/admin/id-failure/route.ts",
  ];

  it("the admin refund routes still exist", () => {
    for (const r of adminRoutes) expect({ r, exists: exists(r) }).toEqual({ r, exists: true });
  });

  it("every admin refund route requires an administrator role", () => {
    for (const r of adminRoutes) {
      expect({ r, guarded: /requireRole\(req, \["event_admin"/.test(read(r)) }).toEqual({ r, guarded: true });
    }
  });

  it("no IT Run route deletes a refund, a refund request, or a payment record", () => {
    const offenders: string[] = [];
    for (const file of participantFiles("app/api/it-run")) {
      const text = read(file);
      if (/from\("(it_run_refunds|it_run_refund_requests|it_run_refund_audit|it_run_payments)"\)[\s\S]{0,120}\.delete\(/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the deadline for changes is still enforced on the server", () => {
  it("the category change route checks the cutoff before any write", () => {
    const route = read("app/api/it-run/registrations/[id]/category/route.ts");
    expect(route).toMatch(/participantChangesOpen/);
  });
});

describe("administrators are not held to the participant deadline", () => {
  it("no admin refund route applies the participant change cutoff", () => {
    const adminRefundRoutes = [
      "app/api/it-run/admin/refund/route.ts",
      "app/api/it-run/admin/refund-requests/create/route.ts",
      "app/api/it-run/admin/refund-requests/[id]/route.ts",
      "app/api/it-run/admin/id-failure/route.ts",
    ];
    for (const r of adminRefundRoutes) {
      expect({ r, cutoff: /participantChangesOpen|CUTOFF_CLOSED/.test(read(r)) }).toEqual({ r, cutoff: false });
    }
  });

  it("administrators can open a general refund request for any paid registration", () => {
    expect(exists("app/api/it-run/admin/refund-requests/create/route.ts")).toBe(true);
    expect(read("app/api/it-run/admin/refund-requests/create/route.ts")).toMatch(/requireRole\(req, \["event_admin"\]\)/);
  });
});
