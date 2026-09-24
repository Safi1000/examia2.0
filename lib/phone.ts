/**
 * WhatsApp numbers are stored in one shape only — E.164, `+` then country code
 * then digits (`+923001234567`). A Postgres CHECK enforces the same pattern, so
 * anything that reaches the database has already been normalised here.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/** Strip spaces, dashes and brackets; keep a single leading `+`. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits.replace(/\+/g, "");
}

export function isValidPhone(input: string): boolean {
  return E164.test(normalizePhone(input));
}

/** wa.me wants bare digits, no `+`. */
export const waDigits = (e164: string) => e164.replace(/\D/g, "");
