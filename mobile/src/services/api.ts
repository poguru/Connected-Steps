import { CS_API_BASE } from "../config";
import type {
  CSUser, LeaderboardEntry, UserStats, UserAchievements,
  Session, UserSession, TrainingPlan, Membership,
  CommunityPost, Story,
} from "../types";

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(identifier: string, password: string): Promise<CSUser> {
  const res = await fetch(`${CS_API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data.user as CSUser;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${CS_API_BASE}/api/leaderboard`);
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = await res.json();
  return data.entries as LeaderboardEntry[];
}

export async function getUserStats(email: string): Promise<UserStats> {
  const res = await fetch(`${CS_API_BASE}/api/leaderboard/user?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json() as Promise<UserStats>;
}

export async function getUserAchievements(email: string): Promise<UserAchievements> {
  const res = await fetch(`${CS_API_BASE}/api/user/achievements?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to load achievements");
  return res.json() as Promise<UserAchievements>;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${CS_API_BASE}/api/sessions`);
  if (!res.ok) throw new Error("Failed to load sessions");
  const data = await res.json();
  return data.data as Session[];
}

export async function getUserSessions(email: string): Promise<UserSession[]> {
  const res = await fetch(`${CS_API_BASE}/api/user/sessions?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to load your sessions");
  const data = await res.json();
  return data.sessions as UserSession[];
}

// ── Training Plan ─────────────────────────────────────────────────────────────

export async function getTrainingPlan(email: string): Promise<TrainingPlan | null> {
  const res = await fetch(`${CS_API_BASE}/api/user/training-plan?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to load training plan");
  const data = await res.json();
  return data.plan as TrainingPlan | null;
}

// ── Membership ────────────────────────────────────────────────────────────────

export async function getMembership(email: string): Promise<Membership | null> {
  const res = await fetch(`${CS_API_BASE}/api/membership?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to load membership");
  const data = await res.json();
  return data.membership as Membership | null;
}

// ── Community ─────────────────────────────────────────────────────────────────

export async function getCommunityPosts(): Promise<CommunityPost[]> {
  const res = await fetch(`${CS_API_BASE}/api/community/posts`);
  if (!res.ok) throw new Error("Failed to load community posts");
  const data = await res.json();
  return data.posts as CommunityPost[];
}

export async function getStories(): Promise<Story[]> {
  const res = await fetch(`${CS_API_BASE}/api/stories`);
  if (!res.ok) throw new Error("Failed to load stories");
  const data = await res.json();
  return data.stories as Story[];
}
