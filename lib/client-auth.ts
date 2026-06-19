/**
 * Client-side auth utilities — never import server modules here.
 *
 * Token format (3-part): base64url(email).exp_unix.hmac
 * Old tokens (2-part):   base64url(email).hmac  ← rejected by verifyUserToken
 */

export function isTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false; // missing or old 2-part format
  const exp = parseInt(parts[1], 10);
  if (!Number.isFinite(exp)) return false;
  return Math.floor(Date.now() / 1000) < exp;
}

export function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("cs_user_token") ?? "";
}

/**
 * Call when any protected API returns 401.
 * Clears the stale token, saves the return path, and redirects to login.
 */
export function handleAuthExpiry(returnPath: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("cs_user_token");
  // Keep cs_user so form fields can be pre-filled after re-login
  sessionStorage.setItem("cs_post_login_redirect", returnPath);
  window.location.href = "/auth?tab=login";
}
