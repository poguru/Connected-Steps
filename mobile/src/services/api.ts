import { CS_API_BASE } from "../config";
import type {
  CSUser, LeaderboardEntry, UserStats, UserAchievements,
  Session, UserSession, TrainingPlan, Membership,
  CommunityPost, Story,
  Coach, Conversation, Message,
  SessionPhoto, FeedEvent,
  MyRegistration, ScanResult, OpsSession,
  AppNotification, TimelineItem,
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

export async function getFriendsLeaderboard(email: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${CS_API_BASE}/api/leaderboard?friends_of=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
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

// ── Admin API (coach-authenticated) ───────────────────────────────────────────

function coachHeaders(token: string) {
  return { "Content-Type": "application/json", "x-coach-token": token };
}

export async function adminGetSessions(coachToken: string): Promise<Session[]> {
  const res = await fetch(`${CS_API_BASE}/api/admin/sessions`, { headers: coachHeaders(coachToken) });
  if (!res.ok) throw new Error("Unauthorized");
  const data = await res.json();
  return data.data as Session[];
}

export async function adminCreateSession(coachToken: string, body: {
  title: string; date: string; time?: string; location: string; venue?: string;
}): Promise<Session> {
  const res = await fetch(`${CS_API_BASE}/api/admin/sessions`, {
    method: "POST", headers: coachHeaders(coachToken), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create session");
  const data = await res.json();
  return data.data as Session;
}

export interface AttendanceUser {
  email: string; name: string; location: string;
  attended: boolean; bonus_points: number; bonus_reason: string;
}
export interface AdminSession extends Session { [k: string]: unknown }

export async function adminGetAttendance(coachToken: string, sessionId: string): Promise<{ session: AdminSession; users: AttendanceUser[] }> {
  const res = await fetch(`${CS_API_BASE}/api/admin/sessions/${sessionId}/attendance`, { headers: coachHeaders(coachToken) });
  if (!res.ok) throw new Error("Failed to load attendance");
  return res.json();
}

export async function adminSaveAttendance(coachToken: string, sessionId: string, users: AttendanceUser[]): Promise<void> {
  await fetch(`${CS_API_BASE}/api/admin/sessions/${sessionId}/attendance`, {
    method: "POST", headers: coachHeaders(coachToken), body: JSON.stringify({ users }),
  });
}

export interface AdminMember {
  email: string; first_name: string; last_name: string;
  phone: string; location: string; goal: string;
  isActiveMember: boolean; membership: string | null;
  total_points: number; session_count: number;
}

export async function adminGetMembers(coachToken: string): Promise<{ users: AdminMember[]; stats: Record<string, number> }> {
  const res = await fetch(`${CS_API_BASE}/api/admin/users`, { headers: coachHeaders(coachToken) });
  if (!res.ok) throw new Error("Failed to load members");
  return res.json();
}

export interface CoachQuestion {
  id: string; user_email: string; user_name: string;
  category: string; question: string; answer: string | null;
  status: string; created_at: string;
}

export async function adminGetQuestions(coachToken: string): Promise<CoachQuestion[]> {
  const res = await fetch(`${CS_API_BASE}/api/coach-questions`, { headers: coachHeaders(coachToken) });
  if (!res.ok) throw new Error("Failed to load questions");
  const data = await res.json();
  return data.questions as CoachQuestion[];
}

export async function adminAnswerQuestion(coachToken: string, id: string, answer: string): Promise<void> {
  await fetch(`${CS_API_BASE}/api/coach-questions/${id}`, {
    method: "PATCH", headers: coachHeaders(coachToken), body: JSON.stringify({ answer }),
  });
}

// ── Photos ────────────────────────────────────────────────────────────────────

export async function getSessionPhotos(sessionId: string): Promise<SessionPhoto[]> {
  const res = await fetch(`${CS_API_BASE}/api/sessions/${sessionId}/photos`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.photos as SessionPhoto[];
}

export async function uploadSessionPhoto(sessionId: string, params: {
  photoUri:      string;
  uploaderEmail: string;
  uploaderName:  string;
  caption?:      string;
  mimeType?:     string;
}): Promise<SessionPhoto> {
  const form = new FormData();
  form.append("photo",          { uri: params.photoUri, name: "photo.jpg", type: params.mimeType ?? "image/jpeg" } as never);
  form.append("uploader_email", params.uploaderEmail);
  form.append("uploader_name",  params.uploaderName);
  if (params.caption) form.append("caption", params.caption);

  const res = await fetch(`${CS_API_BASE}/api/sessions/${sessionId}/photos`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.photo as SessionPhoto;
}

export async function likePhoto(sessionId: string, photoId: string, userEmail: string): Promise<"liked" | "unliked"> {
  const res = await fetch(`${CS_API_BASE}/api/sessions/${sessionId}/photos/${photoId}?action=like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_email: userEmail }),
  });
  const data = await res.json();
  return data.action as "liked" | "unliked";
}

export async function deletePhoto(sessionId: string, photoId: string, userEmail: string): Promise<void> {
  await fetch(`${CS_API_BASE}/api/sessions/${sessionId}/photos/${photoId}?email=${encodeURIComponent(userEmail)}`, { method: "DELETE" });
}

// ── Session Registration ──────────────────────────────────────────────────────

export async function joinSession(sessionId: string, email: string): Promise<{ success: boolean; already: boolean }> {
  const res = await fetch(`${CS_API_BASE}/api/sessions/${sessionId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to join session");
  return data as { success: boolean; already: boolean };
}

export async function leaveSession(sessionId: string, email: string): Promise<void> {
  const res = await fetch(`${CS_API_BASE}/api/sessions/${sessionId}/join`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to leave session");
  }
}

export async function getRSVPCounts(sessionIds: string[]): Promise<Record<string, number>> {
  if (!sessionIds.length) return {};
  const res = await fetch(`${CS_API_BASE}/api/sessions/rsvp-counts?ids=${sessionIds.join(",")}`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.counts as Record<string, number>;
}

// ── Auth: Register ────────────────────────────────────────────────────────────

export async function registerUser(params: {
  firstName: string; lastName: string; email: string;
  phone?: string; goal?: string; location?: string; password: string;
}): Promise<void> {
  const res = await fetch(`${CS_API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Registration failed");
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

export async function getActivityFeed(email: string): Promise<FeedEvent[]> {
  const res = await fetch(`${CS_API_BASE}/api/feed?email=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.events as FeedEvent[];
}

// ── Admin API (coach-authenticated) ───────────────────────────────────────────

export async function adminAssignPlan(coachToken: string, body: {
  user_email: string; title: string; coach_name: string;
  days: { type: string; detail: string; emoji: string }[];
}): Promise<void> {
  const res = await fetch(`${CS_API_BASE}/api/admin/training-plans`, {
    method: "POST", headers: coachHeaders(coachToken), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to assign plan");
}

// ── Participant portal (requires x-user-token) ────────────────────────────────

function participantHeaders(userToken: string) {
  return { "Content-Type": "application/json", "x-user-token": userToken };
}

export async function getMyRegistrations(userToken: string): Promise<MyRegistration[]> {
  const res = await fetch(`${CS_API_BASE}/api/events/my-registrations`, {
    headers: participantHeaders(userToken),
  });
  if (!res.ok) throw new Error("Failed to load registrations");
  const data = await res.json();
  return data.registrations as MyRegistration[];
}

export async function getMyEvent(
  userToken: string,
  registrationCode: string,
): Promise<MyRegistration> {
  const res = await fetch(`${CS_API_BASE}/api/my-events/${registrationCode}`, {
    headers: participantHeaders(userToken),
  });
  if (!res.ok) throw new Error("Failed to load event details");
  return res.json() as Promise<MyRegistration>;
}

export async function getEventTimeline(
  userToken: string,
  registrationCode: string,
): Promise<TimelineItem[]> {
  const res = await fetch(`${CS_API_BASE}/api/my-events/${registrationCode}/timeline`, {
    headers: participantHeaders(userToken),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.timeline as TimelineItem[];
}

export async function getUserInvoices(userToken: string): Promise<
  Array<{ invoice_number: string; product_name: string; total_amount: number; created_at: string }>
> {
  const res = await fetch(`${CS_API_BASE}/api/user/invoices`, {
    headers: participantHeaders(userToken),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.invoices ?? [];
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(
  userToken: string,
  before?: string,
): Promise<{ notifications: AppNotification[]; unread_count: number }> {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  const res = await fetch(`${CS_API_BASE}/api/notifications?${params}`, {
    headers: participantHeaders(userToken),
  });
  if (!res.ok) return { notifications: [], unread_count: 0 };
  return res.json();
}

export async function markNotificationsRead(userToken: string): Promise<void> {
  await fetch(`${CS_API_BASE}/api/notifications`, {
    method:  "POST",
    headers: participantHeaders(userToken),
  });
}

export async function markOneNotificationRead(userToken: string, id: string): Promise<void> {
  await fetch(`${CS_API_BASE}/api/notifications/${id}`, {
    method:  "PATCH",
    headers: participantHeaders(userToken),
  });
}

// ── Volunteer ops ─────────────────────────────────────────────────────────────

function opsHeaders(opsToken: string) {
  return {
    "Content-Type": "application/json",
    "Cookie":       `ops_session=${opsToken}`,
  };
}

export async function opsLogin(params: {
  email: string; password: string; event_id: string;
}): Promise<OpsSession> {
  const res = await fetch(`${CS_API_BASE}/api/ops/auth/mobile`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return {
    token:      data.token,
    expires_at: data.expires_at,
    role:       data.role,
    name:       data.name,
    email:      data.email,
    event_id:   params.event_id,
  } as OpsSession;
}

export async function opsLogout(opsToken: string): Promise<void> {
  await fetch(`${CS_API_BASE}/api/ops/auth`, {
    method:  "DELETE",
    headers: opsHeaders(opsToken),
  }).catch(() => {});
}

export async function opsScan(
  opsToken: string,
  eventId:  string,
  params: { service: string; qr_token: string; dry_run?: boolean },
): Promise<ScanResult> {
  const res = await fetch(`${CS_API_BASE}/api/ops/events/${eventId}/scan`, {
    method:  "POST",
    headers: opsHeaders(opsToken),
    body:    JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Scan failed");
  return data as ScanResult;
}

export async function opsLiveStats(
  opsToken: string,
  eventId:  string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${CS_API_BASE}/api/ops/events/${eventId}/live-stats`, {
    headers: opsHeaders(opsToken),
  });
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

export async function opsSearchParticipants(
  opsToken: string,
  eventId:  string,
  query:    string,
): Promise<unknown[]> {
  const res = await fetch(
    `${CS_API_BASE}/api/ops/events/${eventId}/registrations?q=${encodeURIComponent(query)}&limit=20`,
    { headers: opsHeaders(opsToken) },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.participants ?? [];
}
