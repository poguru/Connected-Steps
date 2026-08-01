// Single source of truth for all external URLs, contact info, and brand constants.
// Server-side code: use APP_URL (no NEXT_PUBLIC_ prefix needed on server).
// Client-side code: NEXT_PUBLIC_APP_URL is available at build time.

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

// Brand
export const BRAND_NAME    = "Connected Steps";
export const BRAND_TAGLINE = "Your Goal, Our Plan";
export const LOGO_URL      = `${APP_URL}/logo.png`;

// Contact
export const SUPPORT_EMAIL        = "info@connectedsteps.in";
export const SUPPORT_PHONE        = "9703620570";
export const SUPPORT_PHONE_INTL   = `+91${SUPPORT_PHONE}`;
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE}`;

// Common deep links
export const DASHBOARD_URL    = `${APP_URL}/dashboard`;
export const PRICING_URL      = `${APP_URL}/pricing`;
export const EVENTS_URL       = `${APP_URL}/events`;
export const LEADERBOARD_URL  = `${APP_URL}/leaderboard`;
export const COMMUNITY_URL    = `${APP_URL}/community`;
export const WEEKEND_RUN_URL  = `${APP_URL}/weekend-run`;

// Admin
export const ADMIN_URL = `${APP_URL}/admin`;

// Colors — matches global CSS variables and email inline styles
export const BRAND_ORANGE  = "#e8620a";
export const BRAND_BLACK   = "#0a0a0a";
export const BRAND_GRAY    = "#f4f4f5";
export const BRAND_ADDRESS = "Connected Steps · Hyderabad, India";
