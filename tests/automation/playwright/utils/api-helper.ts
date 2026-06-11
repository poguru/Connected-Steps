import { APIRequestContext } from "@playwright/test";
import { ENV } from "./env";

export class ApiHelper {
  constructor(private request: APIRequestContext) {}

  // ── Auth ─────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    return this.request.post("/api/auth/login", {
      data: { email, password },
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
    return this.request.post(`/api/sessions/${sessionId}/join`);
  }

  async leaveSession(sessionId: string) {
    return this.request.delete(`/api/sessions/${sessionId}/join`);
  }

  async getJoinedSessions() {
    return this.request.get("/api/user/joined-sessions");
  }

  // ── Membership ───────────────────────────────────────────────────────────

  async getMembership() {
    return this.request.get("/api/membership");
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

  // ── Leaderboard ───────────────────────────────────────────────────────────

  async getLeaderboard() {
    return this.request.get("/api/leaderboard");
  }

  async getUserRank() {
    return this.request.get("/api/leaderboard/user");
  }

  async getLeaderboardBreakdown() {
    return this.request.get("/api/leaderboard/breakdown");
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async getNotifications() {
    return this.request.get("/api/notifications");
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
    return this.request.post("/api/community/posts", { data });
  }

  async getFeed() {
    return this.request.get("/api/feed");
  }

  async createPost(data: { type: string; content: string }) {
    return this.request.post("/api/posts", { data });
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

  // ── Cron ─────────────────────────────────────────────────────────────────

  async triggerCron(path: string) {
    return this.request.get(`/api/cron/${path}`, {
      headers: { Authorization: `Bearer ${ENV.CRON_SECRET}` },
    });
  }

  // ── User ─────────────────────────────────────────────────────────────────

  async getTrainingPlan() {
    return this.request.get("/api/user/training-plan");
  }

  async getUserAchievements() {
    return this.request.get("/api/user/achievements");
  }

  async changeEmail(currentEmail: string, newEmail: string, otp: string) {
    return this.request.post("/api/user/change-email", {
      data: { currentEmail, newEmail, otp },
    });
  }
}
