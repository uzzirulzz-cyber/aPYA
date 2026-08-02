/**
 * 12-character SAR invite code generator.
 *
 * Format: SAR-XXXXXXXX
 *   - "SAR" prefix (3 chars)
 *   - "-" separator (1 char)
 *   - 8 random uppercase alphanumeric chars (excludes 0/O/1/I/L to avoid confusion)
 *   - Total: 12 characters
 *
 * Example: SAR-K7M3-PQ9X  →  wait that's 12 with two dashes. Let me recompute.
 *   SAR (3) + - (1) + 8 random = 12 chars total. ✓
 *   Example: SAR-K7M3PQ9X
 *
 * The random alphabet excludes ambiguous characters:
 *   - No 0 (looks like O)
 *   - No O (looks like 0)
 *   - No 1 (looks like I/l)
 *   - No I (looks like 1)
 *   - No L (looks like 1)
 *
 * This gives 31 possible chars (A-Z minus I,L,O = 23, plus 2-9 = 8 → 31 total).
 * 31^8 ≈ 8.5 × 10^11 possible codes — plenty unique for invite use.
 */

import { randomBytes } from "crypto";

// Unambiguous alphabet: 23 letters + 8 digits = 31 chars
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXZ23456789";
const RANDOM_LENGTH = 8;

/**
 * Generate a fresh 12-char SAR invite code.
 * Format: SAR-XXXXXXXX (e.g. SAR-K7M3PQ9X)
 */
export function generateSarCode(): string {
  const bytes = randomBytes(RANDOM_LENGTH);
  let random = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    random += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `SAR-${random}`;
}

/**
 * Validate that a string is a well-formed SAR code.
 * Accepts case-insensitive input, normalizes to uppercase.
 * Allows optional spaces/dashes for readability.
 *
 * Valid inputs:
 *   "SAR-K7M3PQ9X"
 *   "sar-k7m3pq9x"
 *   "SAR K7M3 PQ9X"
 *   "SARK7M3PQ9X"
 */
export function normalizeSarCode(input: string): string | null {
  if (!input) return null;
  // Strip all non-alphanumeric, uppercase
  const cleaned = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // Must start with SAR + 8 chars from the unambiguous alphabet
  // (excludes I, L, O, Y to avoid confusion with 1, l, 0, V)
  const validChar = "[ABCDEFGHJKMNPQRSTUVWXZ23456789]";
  const re = new RegExp(`^SAR${validChar}{8}$`);
  if (!re.test(cleaned)) return null;
  // Reformat with dash: SAR-XXXXXXXX
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}

/**
 * Check if a SAR code matches the canonical format (already normalized).
 */
export function isValidSarCode(code: string): boolean {
  const validChar = "[ABCDEFGHJKMNPQRSTUVWXZ23456789]";
  const re = new RegExp(`^SAR-${validChar}{8}$`);
  return re.test(code);
}
