import { CS_API_BASE } from "../config";
import type {
  CSUser, LeaderboardEntry, UserStats, UserAchievements,
  Session, UserSession, TrainingPlan, Membership,
  CommunityPost, Story,
  Coach, Conversation, Message,
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

// ── Messaging ─────────────────────────────────────────────────────────────────

export async function getCoaches(): Promise<Coach[]> {
  const res = await fetch(`${CS_API_BASE}/api/coaches`);
  if (!res.ok) throw new Error("Failed to load coaches");
  const data = await res.json();
  return data.coaches as Coach[];
}

export async function getConversations(email: string): Promise<Conversation[]> {
  const res = await fetch(`${CS_API_BASE}/api/messages/conversations?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to load conversations");
  const data = await res.json();
  return data.conversations as Conversation[];
}

export async function getCoachConversations(coachEmail: string): Promise<Conversation[]> {
  const res = await fetch(`${CS_API_BASE}/api/messages/conversations?coach_email=${encodeURIComponent(coachEmail)}`);
  if (!res.ok) throw new Error("Failed to load coach conversations");
  const data = await res.json();
  return data.conversations as Conversation[];
}

export async function startConversation(userEmail: string, coachId: string): Promise<Conversation> {
  const res = await fetch(`${CS_API_BASE}/api/messages/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_email: userEmail, coach_id: coachId }),
  });
  if (!res.ok) throw new Error("Failed to start conversation");
  const data = await res.json();
  return data.conversation as Conversation;
}

export async function getMessages(conversationId: string, before?: string): Promise<Message[]> {
  const url = `${CS_API_BASE}/api/messages/${conversationId}${before ? `?before=${encodeURIComponent(before)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load messages");
  const data = await res.json();
  return data.messages as Message[];
}

export async function sendMessage(conversationId: string, params: {
  sender_email: string;
  sender_type:  "user" | "coach";
  body:         string;
}): Promise<Message> {
  const res = await fetch(`${CS_API_BASE}/api/messages/${conversationId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to send message");
  const data = await res.json();
  return data.message as Message;
}

export async function markConversationRead(conversationId: string, readerType: "user" | "coach"): Promise<void> {
  await fetch(`${CS_API_BASE}/api/messages/${conversationId}/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reader_type: readerType }),
  });
}

export async function registerPushToken(userEmail: string, token: string, platform?: string): Promise<void> {
  await fetch(`${CS_API_BASE}/api/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_email: userEmail, token, platform }),
  });
}
