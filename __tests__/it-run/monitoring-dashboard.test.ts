/**
 * The registration monitoring page: in the admin menu for event admins, reads the summary route, shows the counts and
 * the stage table, and never shows personal details.
 */

import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("the monitoring page", () => {
  const page = read("app/it-run/admin/monitoring/page.tsx");

  it("reads the summary route for the chosen period", () => {
    expect(page).toMatch(/fetch\(`\/api\/it-run\/admin\/monitoring\?days=\$\{days\}`/);
  });

  it("shows the five summary cards and the stage table", () => {
    for (const label of ["Registration journeys", "Active now", "Abandoned", "Completed", "Conversion"]) {
      expect(page).toMatch(new RegExp(label));
    }
    expect(page).toMatch(/Where journeys are now/);
  });

  it("shows a clear state when access is refused, and an error message otherwise", () => {
    expect(page).toMatch(/res\.status === 401 \|\| res\.status === 403/);
    expect(page).toMatch(/You don&apos;t have permission/);
    expect(page).toMatch(/role="alert"/);
  });

  it("shows no personal details", () => {
    expect(page).not.toMatch(/mobile|email|first_name|otp_value|otp_code/i);
  });
});

describe("the admin menu", () => {
  it("lists the monitoring page for event admins and super admins", () => {
    const layout = read("app/it-run/admin/layout.tsx");
    expect(layout).toMatch(/href: "\/it-run\/admin\/monitoring", label: "Registration Monitoring"[\s\S]*?roles: \["super_admin", "event_admin"\]/);
  });
});
