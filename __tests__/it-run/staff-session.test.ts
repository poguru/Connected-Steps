/**
 * The staff session carries the event and the role's permissions. Before this, the cookie held neither, so every
 * non-super-admin staff check failed and every event query ran against an empty event id.
 */

import { encodeStaffSession, verifyStaffSession, type StaffSession } from "@/lib/staff-auth";

const BASE: StaffSession = {
  staffId: "s-1",
  email: "volunteer@example.com",
  fullName: "",
  eventId: "ev-1",
  role: "checkin_staff",
  permissions: ["PARTICIPANT_SEARCH", "BIB_COLLECT"],
  status: "active",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

beforeAll(() => {
  process.env.STAFF_SESSION_SECRET = "test-secret";
});

describe("staff session", () => {
  it("round-trips the event and permissions", () => {
    const out = verifyStaffSession(encodeStaffSession(BASE));
    expect(out).toMatchObject({
      staffId: "s-1",
      email: "volunteer@example.com",
      role: "checkin_staff",
      eventId: "ev-1",
      permissions: ["PARTICIPANT_SEARCH", "BIB_COLLECT"],
    });
  });

  it("refuses a token whose payload has been altered", () => {
    const [body, sig] = encodeStaffSession(BASE).split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "super_admin" })).toString("base64url");
    expect(verifyStaffSession(`${forged}.${sig}`)).toBeNull();
  });

  it("refuses an expired token", () => {
    const expired = { ...BASE, exp: Math.floor(Date.now() / 1000) - 10 };
    expect(verifyStaffSession(encodeStaffSession(expired))).toBeNull();
  });

  it("refuses a malformed token without throwing", () => {
    expect(verifyStaffSession("not-a-token")).toBeNull();
    expect(verifyStaffSession("")).toBeNull();
  });

  it("gives an empty permission list when the role has none", () => {
    const out = verifyStaffSession(encodeStaffSession({ ...BASE, permissions: [] }));
    expect(out?.permissions).toEqual([]);
  });
});
