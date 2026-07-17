/**
 * Pure helpers for the enquiry "Submit Response" flow:
 *
 *  - validateResponseNotes: client-side length validation for the optional
 *    Response Notes field on the Quote form. Notes are OPTIONAL, but when
 *    the user does provide text it must fall inside the min/max bounds.
 *  - buildQuoteMirrorMessage: builds the thread message that mirrors the
 *    submitted quote into the discussion. Returns null whenever the mirror
 *    should NOT run (any status other than "responded", or no meaningful
 *    content to post — empty / whitespace-only notes must never create a
 *    message).
 *
 * Both helpers are pure so they can be unit-tested without a DB / network.
 */

export const RESPONSE_NOTES_MIN_LENGTH = 5;
export const RESPONSE_NOTES_MAX_LENGTH = 2000;

export interface ResponseNotesValidationResult {
  ok: boolean;
  /** User-facing message; empty string when ok. */
  error: string;
  /** Trimmed value that should be persisted (or empty string if none). */
  trimmed: string;
}

export function validateResponseNotes(raw: string | null | undefined): ResponseNotesValidationResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    // Notes are optional — empty is fine, but callers must NOT persist
    // whitespace-only values and must NOT create a thread message.
    return { ok: true, error: "", trimmed: "" };
  }
  if (trimmed.length < RESPONSE_NOTES_MIN_LENGTH) {
    return {
      ok: false,
      error: `Response notes must be at least ${RESPONSE_NOTES_MIN_LENGTH} characters (or leave the field blank).`,
      trimmed,
    };
  }
  if (trimmed.length > RESPONSE_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: `Response notes must be ${RESPONSE_NOTES_MAX_LENGTH} characters or fewer.`,
      trimmed,
    };
  }
  return { ok: true, error: "", trimmed };
}

export interface QuoteMirrorInput {
  pricing?: string | null;
  availability?: string | null;
  leadTime?: string | null;
  notes?: string | null;
}

/**
 * Build the message that mirrors a submitted quote into the enquiry's
 * discussion thread. Returns null when nothing should be posted.
 *
 * Rules:
 *  - status must be exactly "responded" (no other status ever mirrors)
 *  - every field is trimmed; whitespace-only fields are dropped
 *  - if no fields remain, return null (never create an empty message)
 *  - notes render on their own line so long text is not squashed inline
 */
export function buildQuoteMirrorMessage(
  input: QuoteMirrorInput,
  status: string,
): string | null {
  if (status !== "responded") return null;

  const pricing = (input.pricing ?? "").trim();
  const availability = (input.availability ?? "").trim();
  const leadTime = (input.leadTime ?? "").trim();
  const notes = (input.notes ?? "").trim();

  const headerParts: string[] = [];
  if (pricing) headerParts.push(`Pricing: ${pricing}`);
  if (availability) headerParts.push(`Availability: ${availability}`);
  if (leadTime) headerParts.push(`Lead time: ${leadTime}`);

  const lines: string[] = [];
  if (headerParts.length > 0) lines.push(headerParts.join(" · "));
  if (notes) lines.push(notes);

  if (lines.length === 0) return null;
  return lines.join("\n");
}