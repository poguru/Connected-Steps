// ── Auth ──────────────────────────────────────────────────────────────────────

export interface CSUser {
  email:      string;
  firstName:  string;
  lastName:   string;
  phone:      string;
  goal:       string;
  location:   string;
  photo:      string | null;
  role?:      "user" | "coach";
  coachToken?: string;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id:              string;
  user_email:      string;
  user_name:       string;
  location:        string | null;
  goal:            string | null;
  week_points:     number;
  month_points:    number;
  total_points:    number;
  prev_month_rank: number | null;
  photo:           string | null;
}

export interface UserStats {
  month_points: number;
  total_points: number;
}

export interface UserAchievements {
  sessionCount:    number;
  leaderboardRank: number | null;
  hasMembership:   boolean;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface Session {
  id:       string;
  title:    string;
  date:     string;
  time:     string | null;
  venue:    string | null;
  location: string | null;
}

export interface UserSession {
  attended:     boolean;
  bonus_points: number | null;
  sessions: {
    id:        string;
    title:     string;
    date:      string;
    time:      string | null;
    venue:     string | null;
    location:  string | null;
    photo_url: string | null;
  };
}

// ── Training Plan ─────────────────────────────────────────────────────────────

export interface TrainingDay {
  type:   string;
  detail: string;
  emoji:  string;
}

export interface TrainingPlan {
  id:         string;
  title:      string;
  coach_name: string;
  days:       TrainingDay[];
  created_at: string;
}

// ── Membership ────────────────────────────────────────────────────────────────

export interface Membership {
  plan:       string;
  status:     string;
  isActive:   boolean;
  expires_at: string;
  started_at: string;
}

// ── Messaging ────────────────────────────────────────────────────────────────

export interface Coach {
  id:             string;
  name:           string;
  specialization: string | null;
  email:          string;
  avatar_url:     string | null;
  bio:            string | null;
}

export interface Conversation {
  id:                   string;
  user_email:           string;
  last_message_at:      string;
  last_message_preview: string | null;
  user_unread:          number;
  coach_unread:         number;
  coaches:              Pick<Coach, "id" | "name" | "specialization" | "avatar_url"> | null;
}

export interface Message {
  id:           string;
  sender_email: string;
  sender_type:  "user" | "coach";
  body:         string;
  created_at:   string;
  read_at:      string | null;
}

// ── Photos & Feed ────────────────────────────────────────────────────────────

export interface SessionPhoto {
  id:             string;
  session_id:     string;
  uploader_email: string;
  uploader_name:  string | null;
  photo_url:      string;
  caption:        string | null;
  likes:          number;
  created_at:     string;
}

export interface FeedEvent {
  id:          string;
  actor_email: string;
  actor_name:  string;
  event_type:  "session_attended" | "photo_uploaded" | "badge_earned";
  payload:     Record<string, string | number>;
  created_at:  string;
}

// ── Community ─────────────────────────────────────────────────────────────────

export interface CommunityPost {
  id:         string;
  user_name:  string;
  category:   string;
  title:      string;
  body:       string;
  created_at: string;
}

export interface Story {
  id:          string;
  user_name:   string;
  quote:       string;
  achievement: string;
  rating:      number | null;
  created_at:  string;
}
