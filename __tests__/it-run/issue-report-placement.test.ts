/**
 * "Report an issue" placement: the floating control must not sit on the registration wizard's
 * navigation, and the wizard's own flag button must be present on every wizard step.
 */

import fs from "fs";
import path from "path";
import { floatingReportHidden, REGISTRATION_ROUTE_PREFIX } from "@/lib/issue-report-placement";

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("floatingReportHidden", () => {
  it.each(["/it-run/register", "/it-run/register/", "/it-run/register/payment"])("hides the floating control on %s", p => {
    expect(floatingReportHidden(p)).toBe(true);
  });

  it.each(["/it-run", "/it-runner", "/it-run/registrations", "/my-events/abc", "/", null])("keeps the floating control on %s", p => {
    expect(floatingReportHidden(p as string | null)).toBe(false);
  });

  it("uses the registration route prefix", () => {
    expect(REGISTRATION_ROUTE_PREFIX).toBe("/it-run/register");
  });
});

describe("the wizard places its own report button", () => {
  const page = read("app/it-run/register/page.tsx");

  it("imports the compact button", () => {
    expect(page).toMatch(/import \{ IssueReportButton \} from "@\/components\/ui\/BugReportFab"/);
  });

  it("renders it in the price bar, on the category step, and on the confirmation step", () => {
    const count = (page.match(/<IssueReportButton \/>/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("the floating widget hides itself on the wizard route and still mounts the form", () => {
    const widget = read("components/ui/BugReportFab.tsx");
    expect(widget).toMatch(/floatingHidden && \(/);
    expect(widget).toMatch(/floatingReportHidden\(pathname\)/);
    expect(widget).toMatch(/OPEN_ISSUE_REPORT_EVENT/);
  });

  it("the compact button is at least 40px, a real button, and labelled", () => {
    const widget = read("components/ui/BugReportFab.tsx");
    expect(widget).toMatch(/width: 40, height: 40/);
    expect(widget).toMatch(/aria-label="Report an issue"/);
  });
});
