/**
 * Shared client-side validators for the enquiry Quote Details form
 * (EnquiryDialog + QueryResponseDialog). Rules are intentionally lenient
 * on empty input — an unfilled quote field is always valid; validation
 * only kicks in once the user has typed something.
 *
 * These validators are UI-only. Legacy DB rows (e.g. Pricing =
 * "NOT AVAILABLE") are still readable — the trigger and columns are
 * unchanged; we only stop NEW bad input from being submitted.
 */

export type ValidationResult = { ok: boolean; error: string };

/** Fixed set of availability choices shown as a Select in the UI. */
export const AVAILABILITY_OPTIONS = [
  "In Stock",
  "Out of Stock",
  "Available on Order",
  "Limited Stock",
  "Discontinued",
] as const;
export type AvailabilityOption = (typeof AVAILABILITY_OPTIONS)[number];

/**
 * Pricing: numeric only. Accepts digits, commas, one decimal, an optional
 * leading ₹ or `Rs`, and an optional `/unit` (or /pc / /piece) suffix.
 * Rejects alphabetic content like "NOT AVAILABLE".
 */
const PRICING_REGEX =
  /^\s*(?:₹|rs\.?)?\s*\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\s*(?:\/\s*(?:unit|pc|pcs|piece))?\s*$/i;

export function validatePricing(raw: string | null | undefined): ValidationResult {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, error: "" };
  if (!PRICING_REGEX.test(v)) {
    return {
      ok: false,
      error:
        "Enter a price in ₹. If the product is unavailable, set Availability instead.",
    };
  }
  return { ok: true, error: "" };
}

export function validateAvailability(raw: string | null | undefined): ValidationResult {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, error: "" };
  if (v.length > 120) {
    return { ok: false, error: "Availability must be 120 characters or fewer." };
  }
  return { ok: true, error: "" };
}

/**
 * Lead time: a number or range, followed by a unit
 * (day/days, week/weeks, month/months, hr/hour/hours).
 *   ✓ "5 days"  ✓ "5-7 days"  ✓ "2 weeks"  ✓ "1 month"
 *   ✗ "asap"    ✗ "next week"
 */
const LEAD_TIME_REGEX =
  /^\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?\s*(?:hr|hrs|hour|hours|day|days|week|weeks|month|months)\s*$/i;

export function validateLeadTime(raw: string | null | undefined): ValidationResult {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, error: "" };
  if (!LEAD_TIME_REGEX.test(v)) {
    return {
      ok: false,
      error: 'Use a number + unit, e.g. "5 days", "5-7 days", "2 weeks", "1 month".',
    };
  }
  return { ok: true, error: "" };
}

/** Any-field validity summary for gating Submit buttons. */
export function isQuoteValid(input: {
  pricing?: string | null;
  availability?: string | null;
  leadTime?: string | null;
}): boolean {
  return (
    validatePricing(input.pricing).ok &&
    validateAvailability(input.availability).ok &&
    validateLeadTime(input.leadTime).ok
  );
}