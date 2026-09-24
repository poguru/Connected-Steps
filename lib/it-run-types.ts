// Shared TypeScript types for the IT Run Sprint-2 event configuration system.
// Used by /api/it-run/event-config (server) and /it-run/register (client).

export interface ItRunEventMeta {
  id: string;
  title: string;
  subtitle: string;
  tagline: string;
  event_date: string;            // YYYY-MM-DD
  report_time: string;           // e.g. "5:30 AM"
  flag_off_time: string;
  venue_name: string;
  venue_address: string;
  city: string;
  registration_opens_at: string | null;
  registration_closes_at: string; // ISO datetime
  status: string;
}

export interface ItRunParticipantLabel {
  role: "solo" | "primary" | "secondary" | "parent" | "child";
  label: string;          // human-readable: "You", "Runner 1", "Child (age ≤ 10)", etc.
  is_child: boolean;
  tshirt_sizes: string[]; // sizes shown in the UI for this participant — adult or child
}

export interface ItRunCategory {
  id: string;
  slug: string;
  name: string;
  distance_km: number;
  category_type: "solo" | "duo" | "kid";
  price_rupees: number;
  description: string | null;
  color: string;
  // Derived server-side from includes_* booleans — frontend never reads individual flags
  is_timed: boolean;       // true when chip timing is provided; drives the race-type badge
  inclusions: string[];
  // Derived server-side from category_type — frontend never implements category_type logic
  participant_count: number;
  participant_labels: ItRunParticipantLabel[];
  max_participants: number | null;
  current_participants: number;
  is_soldout: boolean;
}

export interface ItRunTerm {
  heading: string;
  body: string;
}

export interface ItRunRegistrationConfig {
  coupon_enabled: boolean;
  contact_email: string;
  contact_phone: string | null;
  terms: ItRunTerm[];
  instructions: string[];
}

export interface ItRunEventConfig {
  event: ItRunEventMeta;
  categories: ItRunCategory[];
  registration: ItRunRegistrationConfig;
}
