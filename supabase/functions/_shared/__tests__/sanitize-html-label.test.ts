import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { htmlToLabel } from "../sanitize-html-label.ts";

const SNAPMINT = `<span class="emi-title">0% EMI on UPI</span> <span class="pay-via-text">Pay via</span><img src="https://assets.snapmint.com/logo.png" alt="Snapmint" />`;

Deno.test("htmlToLabel: snapmint gateway HTML → dedup'd label", () => {
  assertEquals(htmlToLabel(SNAPMINT), "0% EMI on UPI Pay via Snapmint");
});

Deno.test("htmlToLabel: plain text passes through unchanged", () => {
  assertEquals(htmlToLabel("Cash on delivery"), "Cash on delivery");
});

Deno.test("htmlToLabel: empty stripped result falls back to payment_method", () => {
  assertEquals(htmlToLabel("<span> </span>", "cod"), "cod");
});

Deno.test("htmlToLabel: no fallback returns empty string", () => {
  assertEquals(htmlToLabel("<span> </span>"), "");
});

Deno.test("htmlToLabel: decodes entities and collapses whitespace", () => {
  assertEquals(htmlToLabel("  Pay&nbsp;now &amp;  save  "), "Pay now & save");
});

Deno.test("htmlToLabel: derives gateway from hostname when alt missing", () => {
  const raw = `<span>EMI</span> Pay via <img src="https://cdn.razorpay.com/logo.png" />`;
  assertEquals(htmlToLabel(raw), "EMI Pay via Razorpay");
});

Deno.test("htmlToLabel: unknown gateway hostname is capitalized SLD", () => {
  const raw = `<span>Buy now</span><img src="https://cdn.acmepay.io/x.png" />`;
  assertEquals(htmlToLabel(raw), "Buy now — Pay via Acmepay");
});