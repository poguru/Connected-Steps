/**
 * My Registrations has a Sign out button in its header. It clears this browser's session the same way the account menu
 * does, clears the server session cookie, then goes to sign in.
 */

import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("the my-registrations sign out", () => {
  const page = read("app/it-run/my-registrations/page.tsx");

  it("shows a Sign out button in the header", () => {
    expect(page).toMatch(/onClick=\{signOut\}[\s\S]*?Sign out/);
  });

  it("clears the stored user and token, calls the logout route, then goes to sign in", () => {
    expect(page).toMatch(/localStorage\.removeItem\("cs_user"\)/);
    expect(page).toMatch(/localStorage\.removeItem\("cs_user_token"\)/);
    expect(page).toMatch(/fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
    expect(page).toMatch(/router\.push\("\/auth\?tab=signin"\)/);
  });
});
