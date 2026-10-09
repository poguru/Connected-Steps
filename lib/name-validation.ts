/**
 * Name Validation Utility
 *
 * Validates first and last names across all registration flows.
 * Supports Unicode letters (including Indian languages), hyphens, apostrophes.
 * Rejects numbers, emojis, special characters, and script injection attempts.
 *
 * Used by:
 * - Frontend: registration form, multi-participant, parent-child
 * - Backend: registration API, account creation, profile updates
 * - Autofill: existing account restoration, saved registration
 */

/**
 * Validate a first or last name.
 *
 * Rules:
 * - Must not be empty or whitespace-only
 * - Must contain at least one letter (Unicode letter category L)
 * - Can contain: Unicode letters, spaces, hyphens, apostrophes
 * - Cannot contain: numbers, emoji, currency symbols, special chars (@#$%&*{}=)
 * - Should be trimmed and normalized
 *
 * Returns: { valid: boolean; error?: string }
 */
export function validateName(input: string | null | undefined): { valid: boolean; error?: string } {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Name is required" };
  }

  // Trim whitespace from both ends
  const trimmed = input.trim();

  // Reject empty or whitespace-only
  if (trimmed.length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }

  // Max length check (reasonable limit for names)
  if (trimmed.length > 100) {
    return { valid: false, error: "Name is too long (max 100 characters)" };
  }

  // Check for script injection patterns
  if (/<[^>]*>|javascript:|on\w+\s*=/i.test(trimmed)) {
    return { valid: false, error: "Invalid characters in name" };
  }

  // Unicode-aware validation
  // Allow: Unicode letters (L*), spaces, hyphens, apostrophes, Unicode combining marks
  // Each character must match one of: letter, mark (diacritic), space, hyphen, apostrophe
  const nameRegex = /^[\p{L}\p{M}\s\-']+$/u;

  if (!nameRegex.test(trimmed)) {
    return { valid: false, error: "Invalid characters in name" };
  }

  // Reject if it's only spaces, hyphens, or apostrophes (must have at least one letter)
  if (!/\p{L}/u.test(trimmed)) {
    return { valid: false, error: "Name must contain at least one letter" };
  }

  // Check for excessive special characters (e.g., "---" or "'''")
  if (/[\-']{3,}/u.test(trimmed)) {
    return { valid: false, error: "Too many hyphens or apostrophes in name" };
  }

  // Check for consecutive spaces
  if (/  +/.test(trimmed)) {
    return { valid: false, error: "Name cannot have multiple consecutive spaces" };
  }

  // Check that it doesn't start or end with hyphen or apostrophe
  if (/^[\-']|[\-']$/.test(trimmed)) {
    return { valid: false, error: "Name cannot start or end with a hyphen or apostrophe" };
  }

  return { valid: true };
}

/**
 * Normalize a name by trimming and handling internal spaces consistently.
 * Preserves legitimate characters (letters, hyphens, apostrophes).
 * Does NOT remove valid characters.
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  // Trim start and end
  let normalized = input.trim();

  // Normalize internal spaces to single space (but preserve them)
  normalized = normalized.replace(/  +/g, " ");

  return normalized;
}

/**
 * Check if a name is valid after normalization.
 * This is the function to call before accepting a name in the form.
 */
export function isValidName(input: string | null | undefined): boolean {
  const normalized = normalizeName(input);
  const result = validateName(normalized);
  return result.valid;
}

/**
 * Get validation error message for a name.
 * Returns empty string if valid.
 */
export function getNameError(input: string | null | undefined): string {
  const normalized = normalizeName(input);
  const result = validateName(normalized);
  return result.error || "";
}
