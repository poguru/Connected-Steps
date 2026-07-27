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
  coachToken?:string;
  userToken?: string;   // 90-day HMAC token for participant APIs (x-user-token)
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
  month_xp:     number;
  total_xp:     number;
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

// ── Event Registration (Participant) ──────────────────────────────────────────

export interface EventParticipant {
  id:              string;
  name:            string;
  registration_code: string;
  distance_category: string;
  tshirt_size:     string | null;
  bib_number:      string | null;
  wave:            string | null;
  gender:          string | null;
  payment_status:  string;
  qr_token:        string | null;
  // service completion flags
  checked_in:      boolean;
  checked_in_at:   string | null;
  tshirt_collected:boolean;
  breakfast_availed:boolean;
  bib_collected:   boolean;
  medal_collected: boolean;
}

export interface MyRegistration {
  registration_code: string;
  status:            string;
  payment_status:    string;
  final_price:       number;
  qr_token:          string | null;
  created_at:        string;
  event: {
    id:         string;
    title:      string;
    date:       string;
    venue:      string | null;
    city:       string | null;
    start_time: string | null;
    route_map_url: string | null;
  };
  participants: EventParticipant[];
  invoice_number: string | null;
}

// ── Volunteer / Ops ───────────────────────────────────────────────────────────

export type OpsRole =
  | "event_admin" | "registration_desk" | "checkin"
  | "tshirt" | "breakfast" | "bib" | "medal" | "certificate"
  | "support" | "medical" | "photography";

export type ScanService =
  | "checkin" | "tshirt" | "breakfast" | "bib" | "medal" | "certificate";

export interface OpsSession {
  token:      string;
  expires_at: number;  // unix timestamp
  role:       OpsRole;
  name:       string;
  email:      string;
  event_id:   string;
  event_title?: string;
}

export interface ScanResult {
  valid:        boolean;
  already_done: boolean;
  done_at:      string | null;
  done_by:      string | null;
  message:      string;
  participant:  {
    id:                string;
    name:              string;
    registration_code: string;
    distance_category: string;
    tshirt_size:       string | null;
    bib_number:        string | null;
    wave:              string | null;
    gender:            string | null;
    payment_status:    string;
  } | null;
}

// ── Sync Queue ────────────────────────────────────────────────────────────────

export interface SyncQueueItem {
  id:              string;
  endpoint:        string;
  method:          string;
  body:            string;
  created_at:      number;
  retry_count:     number;
  last_error:      string | null;
  idempotency_key: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id:         string;
  title:      string;
  body:       string;
  data:       Record<string, string> | null;
  is_read:    boolean;
  created_at: string;
}

// ── Live Event ────────────────────────────────────────────────────────────────

export interface TimelineItem {
  type:       string;
  label:      string;
  subtitle:   string | null;
  timestamp:  string | null;
  status:     "completed" | "pending" | "upcoming";
  icon:       string;
}
