/**
 * The WhatsApp contact link. Only digits are used, and the number must include its country code. The old Connected
 * Steps number is refused here, so a link can never point at a number that has been blocked.
 */

const BLOCKED_NUMBERS = new Set(["919703620570", "9703620570"]);

/** https://wa.me link for the number with a prefilled message, or null when the number is missing, malformed or blocked. */
export function whatsappSupportLink(number: string | null | undefined, message: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (BLOCKED_NUMBERS.has(digits)) return null;
  // A bare 10-digit Indian mobile gets the country code
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
