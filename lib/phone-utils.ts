/**
 * Phone Number Normalization Utilities
 * Canonical format: +91XXXXXXXXXX (India)
 *
 * Handles:
 * - 9632588555 → +919632588555
 * - +91 9632588555 → +919632588555
 * - +919632588555 → +919632588555
 * - Existing users with legacy formats
 */

/**
 * Normalize phone to canonical format: +91XXXXXXXXXX
 * Extracts only digits, returns with country code
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Extract only digits
  const digits = phone.replace(/\D/g, "");

  // Handle 10-digit format (legacy/raw)
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // Handle 12-digit format with country code (+91)
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91${digits.slice(2)}`;
  }

  // Handle 11-digit with leading 0 (+0, not valid for +91 system, but user may enter it)
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  // Invalid format
  return null;
}

/**
 * Check if two phones are the same (normalized comparison)
 * Handles all formats: 10-digit, +91 format, with/without spaces
 */
export function phonesAreEqual(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
  const norm1 = normalizePhone(phone1);
  const norm2 = normalizePhone(phone2);

  if (!norm1 || !norm2) return false;
  return norm1 === norm2;
}

/**
 * Extract subscriber digits (10-digit part) from any format
 * Used for display or validation
 */
export function getSubscriberDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);

  return null;
}

/**
 * Validate Indian phone number format
 * Returns true only for valid 10-digit Indian numbers (in any format)
 */
export function isValidIndianPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;

  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  // Valid Indian phone: +91 followed by exactly 10 digits, starting with 6-9
  return /^\+91[6-9]\d{9}$/.test(normalized);
}

/**
 * Format phone for display (with spaces)
 * +919632588555 → +91 9632588555
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const countryCode = normalized.slice(0, 3); // +91
  const areaCode = normalized.slice(3, 6);    // 963
  const exchange = normalized.slice(6, 9);    // 258
  const subscriber = normalized.slice(9);      // 8555

  return `${countryCode} ${areaCode} ${exchange} ${subscriber}`;
}

/**
 * Extract 10-digit subscriber portion from any format
 * For display in forms/UI when country code selector is separate
 * +919632588555 → 9632588555
 */
export function getPhoneForForm(phone: string | null | undefined): string {
  const digits = getSubscriberDigits(phone);
  return digits || "";
}
