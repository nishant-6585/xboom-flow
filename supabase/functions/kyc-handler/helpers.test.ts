import { describe, it, expect, vi } from "vitest";
import {
  isValidEmail,
  shouldRetry,
  sendWithRetry,
  isDuplicate,
  type SendResult,
} from "./helpers";

const noSleep = () => Promise.resolve();

describe("isValidEmail", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe("shouldRetry", () => {
  it("retries on 429 / 5xx / network", () => {
    expect(shouldRetry({ ok: false, status: 429 })).toBe(true);
    expect(shouldRetry({ ok: false, status: 500 })).toBe(true);
    expect(shouldRetry({ ok: false, status: 503 })).toBe(true);
    expect(shouldRetry({ ok: false, network: true, error: "boom" })).toBe(true);
  });
  it("does NOT retry on hard 4xx", () => {
    expect(shouldRetry({ ok: false, status: 400 })).toBe(false);
    expect(shouldRetry({ ok: false, status: 401 })).toBe(false);
    expect(shouldRetry({ ok: false, status: 422 })).toBe(false);
  });
  it("does not retry on ok", () => {
    expect(shouldRetry({ ok: true, status: 200 })).toBe(false);
  });
});

describe("sendWithRetry", () => {
  it("succeeds on first attempt — attempt_count=1", async () => {
    const fn = vi.fn(async (): Promise<SendResult> => ({ ok: true, status: 200 }));
    const out = await sendWithRetry(fn, { sleep: noSleep });
    expect(out).toMatchObject({ ok: true, status: "sent", attempt_count: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient 429 then succeeds on 3rd — attempt_count=3", async () => {
    const responses: SendResult[] = [
      { ok: false, status: 429, error: "rate" },
      { ok: false, status: 503, error: "down" },
      { ok: true, status: 200 },
    ];
    const fn = vi.fn(async () => responses.shift()!);
    const out = await sendWithRetry(fn, { sleep: noSleep });
    expect(out).toMatchObject({ ok: true, status: "sent", attempt_count: 3 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("exhausts 3 attempts on persistent 5xx — attempt_count=3, failed", async () => {
    const fn = vi.fn(async (): Promise<SendResult> => ({
      ok: false,
      status: 500,
      error: "server boom",
    }));
    const out = await sendWithRetry(fn, { sleep: noSleep });
    expect(out).toMatchObject({
      ok: false,
      status: "failed",
      attempt_count: 3,
      error: "server boom",
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on a network throw response", async () => {
    const responses: SendResult[] = [
      { ok: false, network: true, error: "ECONNRESET" },
      { ok: true, status: 200 },
    ];
    const fn = vi.fn(async () => responses.shift()!);
    const out = await sendWithRetry(fn, { sleep: noSleep });
    expect(out).toMatchObject({ ok: true, attempt_count: 2 });
  });

  it("does NOT retry hard 4xx (invalid email) — attempt_count=1", async () => {
    const fn = vi.fn(async (): Promise<SendResult> => ({
      ok: false,
      status: 422,
      error: "invalid `to` address",
    }));
    const out = await sendWithRetry(fn, { sleep: noSleep });
    expect(out).toMatchObject({
      ok: false,
      status: "failed",
      attempt_count: 1,
      error: "invalid `to` address",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honors a custom maxAttempts", async () => {
    const fn = vi.fn(async (): Promise<SendResult> => ({ ok: false, status: 500 }));
    const out = await sendWithRetry(fn, { sleep: noSleep, maxAttempts: 2 });
    expect(out.attempt_count).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("isDuplicate", () => {
  it("skips when a sent row exists", () => {
    expect(isDuplicate([{ status: "sent" }])).toBe(true);
    expect(isDuplicate([{ status: "failed" }, { status: "sent" }])).toBe(true);
    expect(isDuplicate([{ status: "SENT" }])).toBe(true);
  });
  it("does not skip when only failed/skipped rows exist", () => {
    expect(isDuplicate([])).toBe(false);
    expect(isDuplicate(null)).toBe(false);
    expect(isDuplicate([{ status: "failed" }, { status: "skipped" }])).toBe(false);
  });
});