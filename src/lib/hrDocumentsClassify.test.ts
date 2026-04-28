import { describe, it, expect } from "vitest";
import { classifyStorageError, FRIENDLY } from "./hrDocumentsClassify";

/**
 * Representative storage error shapes observed in production across
 * Chromium (Chrome / Edge), WebKit (Safari), and Gecko (Firefox).
 *
 * Each fixture reflects a real failure mode the helper must classify
 * consistently regardless of which browser surfaced it.
 */

describe("classifyStorageError — HTTP status code (priority 1)", () => {
  it("maps 404 → not_found (Chromium Supabase StorageApiError shape)", () => {
    // supabase-js typically exposes statusCode as a string on StorageApiError.
    const err = {
      name: "StorageApiError",
      message: "Object not found",
      statusCode: "404",
      error: "NotFound",
    };
    expect(classifyStorageError(err)).toEqual({
      reason: "not_found",
      friendly: FRIENDLY.not_found,
    });
  });

  it("maps 403 → forbidden (Safari fetch Response shape via cause)", () => {
    const err = {
      name: "Error",
      message: "Load failed",
      cause: { status: 403, statusText: "Forbidden" },
    };
    expect(classifyStorageError(err).reason).toBe("forbidden");
  });

  it("maps 401 → forbidden (Firefox numeric status property)", () => {
    const err = { message: "Unauthorized request", status: 401 };
    expect(classifyStorageError(err).reason).toBe("forbidden");
  });

  it("maps 410 → not_found (deleted object)", () => {
    expect(classifyStorageError({ statusCode: 410, message: "" }).reason).toBe(
      "not_found"
    );
  });

  it("treats 500 / 502 / 503 as unknown (transient — eligible for Retry)", () => {
    for (const statusCode of [500, 502, 503, 504]) {
      expect(classifyStorageError({ statusCode, message: "Boom" }).reason).toBe(
        "unknown"
      );
    }
  });
});

describe("classifyStorageError — canonical slug (priority 2)", () => {
  it.each([
    ["NotFound", "not_found"],
    ["not_found", "not_found"],
    ["Object Not Found", "not_found"],
    ["Unauthorized", "forbidden"],
    ["Forbidden", "forbidden"],
    ["permission_denied", "forbidden"],
    ["AccessDenied", "forbidden"],
  ] as const)("maps slug %s → %s when status is absent", (slug, expected) => {
    expect(classifyStorageError({ error: slug, message: "" }).reason).toBe(
      expected
    );
  });

  it("uses `code` field when `error` is absent (Firefox fetch error wrappers)", () => {
    expect(
      classifyStorageError({ code: "NotFound", message: "" }).reason
    ).toBe("not_found");
  });
});

describe("classifyStorageError — keyword fallback (priority 3)", () => {
  it("classifies RLS denial messages as forbidden", () => {
    const messages = [
      "new row violates row-level security policy",
      "permission denied for table objects",
      "Access denied",
      "Operation not allowed by RLS",
    ];
    for (const message of messages) {
      expect(classifyStorageError({ message }).reason).toBe("forbidden");
    }
  });

  it("classifies missing-object messages as not_found", () => {
    const messages = [
      "Object not found",
      "no such file or directory",
      "object does not exist",
      "missing object: referrals/abc/resume.pdf",
    ];
    for (const message of messages) {
      expect(classifyStorageError({ message }).reason).toBe("not_found");
    }
  });

  it("does NOT mis-classify generic 'object' wording as not_found", () => {
    // The previous classifier matched the bare word "object" which produced
    // false positives. The hardened version requires explicit phrasing.
    expect(
      classifyStorageError({ message: "Internal storage object error" }).reason
    ).toBe("unknown");
  });
});

describe("classifyStorageError — cross-browser network throws", () => {
  it("Chromium 'TypeError: Failed to fetch' → unknown", () => {
    const err = new TypeError("Failed to fetch");
    expect(classifyStorageError(err).reason).toBe("unknown");
  });

  it("Safari 'TypeError: Load failed' → unknown", () => {
    const err = new TypeError("Load failed");
    expect(classifyStorageError(err).reason).toBe("unknown");
  });

  it("Firefox 'NetworkError when attempting to fetch resource' → unknown", () => {
    const err = new TypeError(
      "NetworkError when attempting to fetch resource."
    );
    expect(classifyStorageError(err).reason).toBe("unknown");
  });
});

describe("classifyStorageError — degenerate inputs", () => {
  it("handles null", () => {
    expect(classifyStorageError(null).reason).toBe("unknown");
  });
  it("handles undefined", () => {
    expect(classifyStorageError(undefined).reason).toBe("unknown");
  });
  it("handles plain string", () => {
    expect(classifyStorageError("Object not found").reason).toBe("not_found");
  });
  it("falls back to friendly default when message is empty", () => {
    expect(classifyStorageError({}).friendly).toBe(FRIENDLY.unknown);
  });
});

describe("classifyStorageError — priority ordering", () => {
  it("status code wins over slug when both disagree", () => {
    // Real-world: server returns 404 with body { error: 'Forbidden' }.
    // Status is more reliable than the body slug.
    expect(
      classifyStorageError({
        statusCode: 404,
        error: "Forbidden",
        message: "permission denied",
      }).reason
    ).toBe("not_found");
  });

  it("slug wins over message keyword when status is absent", () => {
    expect(
      classifyStorageError({
        error: "NotFound",
        message: "permission denied",
      }).reason
    ).toBe("not_found");
  });
});