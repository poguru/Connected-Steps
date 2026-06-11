import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

const db = () =>
  createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY, {
    auth: { persistSession: false },
  });

export const DbHelper = {
  // ── Users ───────────────────────────────────────────────────────────────
  async deactivateUser(email: string) {
    const { error } = await db().from("users").update({ is_active: false }).eq("email", email);
    if (error) throw new Error(`deactivateUser: ${error.message}`);
  },

  async activateUser(email: string) {
    const { error } = await db().from("users").update({ is_active: true }).eq("email", email);
    if (error) throw new Error(`activateUser: ${error.message}`);
  },

  async setUserRole(email: string, role: "user" | "coach" | "admin") {
    const { error } = await db().from("users").update({ role }).eq("email", email);
    if (error) throw new Error(`setUserRole: ${error.message}`);
  },

  async deleteUser(email: string) {
    await db().from("users").delete().eq("email", email);
  },

  async getUserByEmail(email: string) {
    const { data } = await db().from("users").select("*").eq("email", email).maybeSingle();
    return data;
  },

  // ── Memberships ──────────────────────────────────────────────────────────
  async setMembershipExpiry(email: string, expiresAt: Date) {
    const { error } = await db()
      .from("memberships")
      .update({ expires_at: expiresAt.toISOString(), status: "active" })
      .eq("user_email", email);
    if (error) throw new Error(`setMembershipExpiry: ${error.message}`);
  },

  async expireMembership(email: string) {
    const past = new Date(Date.now() - 1000);
    await DbHelper.setMembershipExpiry(email, past);
  },

  async deleteMembership(email: string) {
    await db().from("memberships").delete().eq("user_email", email);
  },

  async getMembership(email: string) {
    const { data } = await db()
      .from("memberships")
      .select("*")
      .eq("user_email", email)
      .eq("status", "active")
      .maybeSingle();
    return data;
  },

  // ── Sessions ─────────────────────────────────────────────────────────────
  async createSession(data: { title: string; date: string; time: string; venue: string; location: string }) {
    const { data: row, error } = await db().from("sessions").insert(data).select().single();
    if (error) throw new Error(`createSession: ${error.message}`);
    return row;
  },

  async deleteSession(id: string) {
    await db().from("sessions").delete().eq("id", id);
  },

  async getUpcomingSession() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { data } = await db()
      .from("sessions")
      .select("*")
      .gte("date", new Date().toISOString().slice(0, 10))
      .limit(1)
      .maybeSingle();
    return data;
  },

  async getAttendanceCount(sessionId: string) {
    const { count } = await db()
      .from("session_attendance")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    return count ?? 0;
  },

  async markAttendance(sessionId: string, email: string, attended = true, bonusPoints = 0) {
    const { error } = await db()
      .from("session_attendance")
      .update({ attended, bonus_points: bonusPoints })
      .eq("session_id", sessionId)
      .eq("user_email", email);
    if (error) throw new Error(`markAttendance: ${error.message}`);
  },

  // ── Coupons ──────────────────────────────────────────────────────────────
  async createCoupon(data: {
    code: string; discount_type: "percent" | "fixed"; discount_value: number;
    max_uses: number; valid_from: string; valid_to: string;
  }) {
    const { data: row, error } = await db().from("coupons").insert({ ...data, active: true }).select().single();
    if (error) throw new Error(`createCoupon: ${error.message}`);
    return row;
  },

  async deleteCoupon(code: string) {
    await db().from("coupons").delete().eq("code", code);
  },

  // ── Notifications ────────────────────────────────────────────────────────
  async getNotificationCount(email: string) {
    const { count } = await db()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("read", false);
    return count ?? 0;
  },

  async clearNotifications(email: string) {
    await db().from("notifications").delete().eq("user_email", email);
  },

  // ── OTP ──────────────────────────────────────────────────────────────────
  async getLatestOtp(identifier: string) {
    const { data } = await db()
      .from("otp_verifications")
      .select("code")
      .eq("identifier", identifier)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.code as string | null;
  },

  // ── Leaderboard ──────────────────────────────────────────────────────────
  async getLeaderboardEntry(email: string) {
    const { data } = await db()
      .from("leaderboard")
      .select("*")
      .eq("user_email", email)
      .maybeSingle();
    return data;
  },

  async setLeaderboardPoints(email: string, monthPoints: number) {
    const { error } = await db()
      .from("leaderboard")
      .update({ month_points: monthPoints })
      .eq("user_email", email);
    if (error) throw new Error(`setLeaderboardPoints: ${error.message}`);
  },

  // ── Stories / Community ───────────────────────────────────────────────────
  async getCommunityPost(id: string) {
    const { data } = await db()
      .from("community_posts")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    return data;
  },
};
