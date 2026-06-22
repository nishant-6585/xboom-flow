/**
 * Client-side mirror of the server-side `public.validate_order_customer_phone`
 * Postgres trigger. Keep these two implementations in sync — the database is
 * the source of truth, this helper exists to give immediate UI feedback.
 */
export type PhoneValidationResult =
  | { valid: true; normalized: string | null }
  | { valid: false; error: string };

const ALLOWED_CHARS = /^[+\d\s\-()]+$/;

export function validateCustomerPhone(input: string | null | undefined): PhoneValidationResult {
  const raw = (input ?? "").trim();
  if (!raw) return { valid: true, normalized: null };

  if (!ALLOWED_CHARS.test(raw)) {
    return {
      valid: false,
      error: "Invalid mobile number: only digits, spaces, +, -, () allowed",
    };
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return {
      valid: false,
      error: `Invalid mobile number: must contain 7 to 15 digits (got ${digits.length})`,
    };
  }
  return { valid: true, normalized: hasPlus ? `+${digits}` : digits };
}

/**
 * Translate a Supabase error (or empty-update result) into a user-friendly
 * message that explains whether the failure was caused by validation, RLS,
 * or simply no matching row.
 */
export interface OrderUpdateErrorContext {
  /** Whether the attempted update touched `customer_phone`. */
  touchedPhone: boolean;
}

export function mapOrderUpdateError(
  error: { code?: string; message?: string } | null | undefined,
  ctx: OrderUpdateErrorContext,
): string {
  const code = error?.code;
  const msg = error?.message || "";

  if (code === "22023" || /mobile number/i.test(msg)) {
    const cleaned = msg.replace(/^.*mobile number/i, "Mobile number");
    return (
      cleaned ||
      "Invalid mobile number. Use 7–15 digits, with optional +, spaces or hyphens."
    );
  }

  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "You do not have permission to update this order. Ask an admin to check your role, then retry.";
  }

  if (!error) {
    return ctx.touchedPhone
      ? "Could not save the mobile number — your role may not allow editing this order. Refresh and retry; if it persists, ask an admin to verify your access."
      : "No rows updated. Your role may not permit this change — refresh and retry, or contact an admin.";
  }

  return msg || "Failed to update order";
}