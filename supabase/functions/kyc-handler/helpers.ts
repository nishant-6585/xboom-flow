// Pure, dependency-free helpers for the kyc-handler edge function.
// Extracted so they can be unit-tested with vitest (no Deno / network).

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export type SendResult =
  | { ok: true; status?: number }
  | { ok: false; status?: number; network?: boolean; error?: string };

/** Decide whether a failed send is transient and worth retrying.
 *  Transient = network throw, HTTP 429, or 5xx. Other 4xx is permanent. */
export function shouldRetry(res: SendResult): boolean {
  if (res.ok) return false;
  if (res.network) return true;
  const status = res.status ?? 0;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

export interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number[];
  /** Test seam: override the default `setTimeout` sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryOutcome {
  ok: boolean;
  status: "sent" | "failed";
  attempt_count: number;
  error?: string;
  lastStatus?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Generic retry wrapper around a send function. Retries only on transient
 *  failures (see `shouldRetry`). Returns the final status + how many attempts
 *  were made (1..maxAttempts). */
export async function sendWithRetry(
  sendFn: () => Promise<SendResult>,
  opts: RetryOptions = {},
): Promise<RetryOutcome> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoffMs = opts.backoffMs ?? [1000, 3000, 9000];
  const sleep = opts.sleep ?? defaultSleep;

  let last: SendResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await sendFn();
    if (last.ok) {
      return { ok: true, status: "sent", attempt_count: attempt, lastStatus: last.status };
    }
    if (attempt >= maxAttempts || !shouldRetry(last)) {
      return {
        ok: false,
        status: "failed",
        attempt_count: attempt,
        error: last.error,
        lastStatus: last.status,
      };
    }
    const delay = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0;
    if (delay > 0) await sleep(delay);
  }
  // Unreachable, but keep TS happy.
  return {
    ok: false,
    status: "failed",
    attempt_count: maxAttempts,
    error: last?.error,
    lastStatus: last?.status,
  };
}

/** True when a prior `sent` row exists for the order — the caller should
 *  skip the send to keep onboardOrder idempotent. */
export function isDuplicate(
  existingRows: Array<{ status?: string | null }> | null | undefined,
): boolean {
  if (!existingRows || existingRows.length === 0) return false;
  return existingRows.some((r) => (r?.status ?? "").toLowerCase() === "sent");
}