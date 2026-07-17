import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/pushNotifications";

describe("urlBase64ToUint8Array", () => {
  it("decodes a known base64url input to correct bytes", () => {
    // "Hello" -> base64 "SGVsbG8=" -> base64url "SGVsbG8"
    const out = urlBase64ToUint8Array("SGVsbG8");
    expect(Array.from(out)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("handles inputs needing padding", () => {
    // "foo" -> "Zm9v" (no padding needed) and "foob" -> "Zm9vYg" (needs 2 =)
    expect(Array.from(urlBase64ToUint8Array("Zm9v"))).toEqual([0x66, 0x6f, 0x6f]);
    expect(Array.from(urlBase64ToUint8Array("Zm9vYg"))).toEqual([0x66, 0x6f, 0x6f, 0x62]);
  });

  it("translates url-safe chars (- and _) back to + and /", () => {
    // "-_-_" (url-safe) == "+/+/" (standard base64) -> bytes [0xfb, 0xff, 0xbf]
    const out = urlBase64ToUint8Array("-_-_");
    expect(Array.from(out)).toEqual([0xfb, 0xff, 0xbf]);
  });

  it("returns a Uint8Array backed by an ArrayBuffer (applicationServerKey shape)", () => {
    const out = urlBase64ToUint8Array("SGVsbG8");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it("decodes the project's VAPID public key to a 65-byte uncompressed P-256 point", () => {
    const key =
      "BFctnOiYFj6PUsuMMubxMoqHK00CBBxk9djeDyxFgZgi2C_rNndWmM3Add3b4ISo86dz7qU-35PHUljvPeCZfL8";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });
});