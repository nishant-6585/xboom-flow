/**
 * Shared client-side validation for email and phone number inputs.
 *
 * Phone rule (per product decision):
 *   - Indian mobile: 10 digits starting with 6-9, optionally prefixed with
 *     +91 or 91 and any of the separators space / hyphen / parentheses.
 *   - International E.164: leading '+', country code, then subscriber number.
 *     Total significant digits between 8 and 15 (ITU-T E.164 limit).
 *
 * Email rule: pragmatic RFC-5322 subset — the same shape used by HTML5 email
 * inputs and the WHATWG living standard, with a hard 254-char cap.
 *
 * Both validators are pure and safe to call inside render / onChange handlers.
 */

export type ValidationResult =
  | { valid: true; normalized: string | null }
  | { valid: false; error: string };

// ---------- email ----------

// WHATWG-aligned email pattern (same as <input type="email"> validity).
// eslint-disable-next-line no-useless-escape
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface EmailValidationOptions {
  required?: boolean;
}

export function validateEmail(
  input: string | null | undefined,
  opts: EmailValidationOptions = {},
): ValidationResult {
  const raw = (input ?? "").trim();
  if (!raw) {
    return opts.required
      ? { valid: false, error: "Email is required" }
      : { valid: true, normalized: null };
  }
  if (raw.length > 254) {
    return { valid: false, error: "Email must be 254 characters or fewer" };
  }
  if (!EMAIL_RE.test(raw)) {
    return { valid: false, error: "Enter a valid email (e.g. name@example.com)" };
  }
  return { valid: true, normalized: raw.toLowerCase() };
}

// ---------- phone ----------

const PHONE_ALLOWED_CHARS = /^[+\d\s\-().]+$/;

export interface PhoneValidationOptions {
  required?: boolean;
}

/**
 * Validate a phone number and return the E.164 normalized form when valid.
 *
 * Accepted:
 *   9812345678, 09812345678, 919812345678, +919812345678,
 *   +91 98123-45678, (91) 9812345678  -> normalized "+919812345678"
 *   +14155552671, +442071838750       -> normalized as-is (E.164)
 *
 * Rejected:
 *   Indian landline / 10-digit not starting with 6-9,
 *   Numbers shorter than 8 or longer than 15 significant digits,
 *   Foreign numbers without a leading '+' (ambiguous country code).
 */
export function validatePhone(
  input: string | null | undefined,
  opts: PhoneValidationOptions = {},
): ValidationResult {
  const raw = (input ?? "").trim();
  if (!raw) {
    return opts.required
      ? { valid: false, error: "Mobile number is required" }
      : { valid: true, normalized: null };
  }

  if (!PHONE_ALLOWED_CHARS.test(raw)) {
    return {
      valid: false,
      error: "Only digits, spaces, +, -, () are allowed",
    };
  }

  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return { valid: false, error: "Enter a valid mobile number" };
  }

  // --- Indian mobile detection ---
  // Strip a leading 91 country code (with or without '+') or a leading 0.
  let indianCandidate: string | null = null;
  if (hasPlus && digits.startsWith("91") && digits.length === 12) {
    indianCandidate = digits.slice(2);
  } else if (!hasPlus && digits.length === 12 && digits.startsWith("91")) {
    indianCandidate = digits.slice(2);
  } else if (!hasPlus && digits.length === 11 && digits.startsWith("0")) {
    indianCandidate = digits.slice(1);
  } else if (!hasPlus && digits.length === 10) {
    indianCandidate = digits;
  }

  if (indianCandidate) {
    if (!/^[6-9]\d{9}$/.test(indianCandidate)) {
      return {
        valid: false,
        error: "Indian mobile must be 10 digits starting with 6, 7, 8 or 9",
      };
    }
    return { valid: true, normalized: `+91${indianCandidate}` };
  }

  // --- International E.164 ---
  // Non-Indian foreign numbers must be explicitly prefixed with '+' so we
  // know the country code — otherwise we cannot disambiguate.
  if (!hasPlus) {
    return {
      valid: false,
      error:
        "Enter a 10-digit Indian mobile (6-9…) or an international number with country code (e.g. +14155552671)",
    };
  }

  if (digits.length < 8 || digits.length > 15) {
    return {
      valid: false,
      error: `International number must have 8-15 digits (got ${digits.length})`,
    };
  }

  // Country code cannot start with 0.
  if (digits.startsWith("0")) {
    return {
      valid: false,
      error: "Country code cannot start with 0",
    };
  }

  return { valid: true, normalized: `+${digits}` };
}

/**
 * Convenience: returns an error string when invalid, or null when valid /
 * empty-and-optional. Ideal for inline `<p>{err}</p>` rendering under a field.
 */
export function emailError(
  input: string | null | undefined,
  opts: EmailValidationOptions = {},
): string | null {
  const r = validateEmail(input, opts);
  return r.valid === false ? r.error : null;
}

export function phoneError(
  input: string | null | undefined,
  opts: PhoneValidationOptions = {},
): string | null {
  const r = validatePhone(input, opts);
  return r.valid === false ? r.error : null;
}
