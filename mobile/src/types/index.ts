// ── Auth ──────────────────────────────────────────────────────────────────────

export interface CSUser {
  email:     string;
  firstName: string;
  lastName:  string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id:           string;
  user_email:   string;
  user_name:    string;
  location:     string | null;
  goal:         string | null;
  month_points: number;
  total_points: number;
  photo:        string | null;
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
