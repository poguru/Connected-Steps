import { APIRequestContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { ENV } from "./env";

const TOKEN_FILE = path.join(__dirname, "../playwright/.auth/token.txt");

/** Read the user JWT token saved by global.setup.ts */
function readUserToken(): string {
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

export class ApiHelper {
  constructor(public readonly request: APIRequestContext) {}

  // ── Auth ─────────────────────────────────────────────────────────────────

  async login(identifier: string, password: string) {
    return this.request.post("/api/auth/login", {
      data: { identifier, password },
    });
  }

  async register(data: {
    firstName: string; lastName: string; email: string;
    password: string; goal?: string; location?: string;
  }) {
    return this.request.post("/api/auth/register", { data });
  }

  async sendOtp(type: "email" | "phone", value: string, purpose = "login") {
    return this.request.post("/api/auth/send-otp", {
      data: { type, value, purpose },
    });
  }

  async verifyOtp(email: string, code: string, purpose = "login") {
    return this.request.post("/api/auth/verify-otp", {
      data: { email, code, purpose },
    });
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async getSessions() {
    return this.request.get("/api/sessions");
  }

  async joinSession(sessionId: string) {
    return this.request.post(`/api/sessions/${sessionId}/join`, {
      data: { email: ENV.TEST_EMAIL },
    });
  }

  async leaveSession(sessionId: string) {
    return this.request.delete(`/api/sessions/${sessionId}/join`, {
      data: { email: ENV.TEST_EMAIL },
    });
  }

  async getJoinedSessions() {
    return this.request.get("/api/user/joined-sessions");
  }

  // ── Membership ───────────────────────────────────────────────────────────

  async getMembership(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/membership?email=${encodeURIComponent(email)}`, {
      headers: { "x-user-token": readUserToken() },
    });
  }

  async createPaymentOrder(plan: string, couponCode?: string) {
    return this.request.post("/api/payment/create-order", {
      data: { plan, couponCode },
    });
  }

  async validateCoupon(code: string, plan: string) {
    return this.request.post("/api/coupons/validate", {
      data: { code, plan },
    });
  }

  // ── Training Plan ─────────────────────────────────────────────────────────

  async getTrainingPlan(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/user/training-plan?email=${encodeURIComponent(email)}`, {
      headers: { "x-user-token": readUserToken() },
    });
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  async getLeaderboard() {
    return this.request.get("/api/leaderboard");
  }

  async getUserRank(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/leaderboard/user?email=${encodeURIComponent(email)}`);
  }

  async getLeaderboardBreakdown(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/leaderboard/breakdown?email=${encodeURIComponent(email)}`);
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async getNotifications(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/notifications?email=${encodeURIComponent(email)}`, {
      headers: { "x-user-token": readUserToken() },
    });
  }

  // ── Referrals ─────────────────────────────────────────────────────────────

  async getReferralCode() {
    return this.request.get("/api/referrals/code");
  }

  async getReferralStats() {
    return this.request.get("/api/referrals/stats");
  }

  async claimReferral(code: string) {
    return this.request.post("/api/referrals/claim", { data: { code } });
  }

  // ── Community ─────────────────────────────────────────────────────────────

  async getCommunityPosts() {
    return this.request.get("/api/community/posts");
  }

  async createCommunityPost(data: { title: string; body: string; category: string }) {
    return this.request.post("/api/community/posts", {
      data: {
        ...data,
        user_email: ENV.TEST_EMAIL,
        user_name:  "QA User",
      },
    });
  }

  async getFeed(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/feed?email=${encodeURIComponent(email)}&scope=global`);
  }

  async createPost(data: { type: string; content: string }) {
    return this.request.post("/api/posts", {
      data: {
        post_type:    data.type,
        body:         data.content,
        author_email: ENV.TEST_EMAIL,
        author_name:  "QA User",
      },
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  async adminLogin(password: string) {
    return this.request.post("/api/admin/auth/login", {
      data: { password },
    });
  }

  async adminSyncSession(sessionId: string) {
    return this.request.post(`/api/admin/sessions/${sessionId}/sync`);
  }

  async adminRecalculateLeaderboard(month: string) {
    return this.request.post("/api/admin/leaderboard/recalculate", {
      data: { month },
    });
  }

  async adminGetUsers() {
    return this.request.get("/api/admin/users");
  }

  async adminGetMemberships() {
    return this.request.get("/api/admin/memberships");
  }

  // ── Events ───────────────────────────────────────────────────────────────

  async getPublishedEvents() {
    return this.request.get("/api/events");
  }

  async getEvent(slug: string) {
    return this.request.get(`/api/events/${slug}`);
  }

  async registerForEvent(data: {
    event_id: string; email: string; name: string; phone: string;
    gender: string; date_of_birth: string; blood_group: string;
    emergency_contact: string; special_notes: string;
    distance_category?: string; tshirt_size?: string;
    coupon_code?: string;
  }, userToken: string) {
    return this.request.post("/api/events/register", {
      data,
      headers: { "x-user-token": userToken },
    });
  }

  async getMyEventRegistrations(userToken: string) {
    return this.request.get("/api/events/my-registrations", {
      headers: { "x-user-token": userToken },
    });
  }

  async getEventQr(token: string) {
    return this.request.get(`/api/events/qr/${encodeURIComponent(token)}`);
  }

  // Admin event endpoints
  async adminGetParticipants(eventId: string, adminToken: string) {
    return this.request.get(`/api/admin/events/${eventId}/participants`, {
      headers: { "x-admin-token": adminToken },
    });
  }

  async adminExportCsv(eventId: string, adminToken: string) {
    return this.request.get(`/api/admin/events/${eventId}/export`, {
      headers: { "x-admin-token": adminToken },
    });
  }

  async adminGetServiceConfig(eventId: string, adminToken: string) {
    return this.request.get(`/api/admin/events/${eventId}/service-config`, {
      headers: { "x-admin-token": adminToken },
    });
  }

  async adminPutServiceConfig(
    eventId: string,
    services: Array<{ service_name: string; enabled: boolean }>,
    adminToken: string,
  ) {
    return this.request.put(`/api/admin/events/${eventId}/service-config`, {
      data: { services },
      headers: { "x-admin-token": adminToken },
    });
  }

  async adminGetPortalUsers(eventId: string, adminToken: string) {
    return this.request.get(`/api/admin/events/${eventId}/portal-users`, {
      headers: { "x-admin-token": adminToken },
    });
  }

  // ── Cron ─────────────────────────────────────────────────────────────────

  async triggerCron(path: string) {
    return this.request.get(`/api/cron/${path}`, {
      headers: { Authorization: `Bearer ${ENV.CRON_SECRET}` },
    });
  }

  // ── User ─────────────────────────────────────────────────────────────────

  async getUserAchievements(email = ENV.TEST_EMAIL) {
    return this.request.get(`/api/user/achievements?email=${encodeURIComponent(email)}`);
  }

  async changeEmail(currentEmail: string, newEmail: string, otp: string) {
    return this.request.post("/api/user/change-email", {
      data: { currentEmail, newEmail, otp },
    });
  }
}
