// Backfill dedupe parity tests.
//
// These mirror the SQL cleanup used to backfill orders.payment_terms
// (see chat context 2026-07-13). The intent: the runtime `htmlToLabel`
// helper must never introduce a duplicate "Pay via" phrase, must leave
// already-clean values untouched, and must produce the same shape the
// SQL backfill produced so old and new rows stay consistent.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { htmlToLabel } from "../sanitize-html-label.ts";

Deno.test("dedupe: HTML that already contains 'Pay via' does not double it", () => {
  const raw = `<span class="emi-title">0% EMI on UPI</span> <span class="pay-via-text">Pay via</span><img src="https://assets.snapmint.com/logo.png" alt="Snapmint" />`;
  const out = htmlToLabel(raw);
  assertEquals(out, "0% EMI on UPI Pay via Snapmint");
  // sanity: only one occurrence of "Pay via"
  const occurrences = out.match(/Pay via/gi) ?? [];
  assertEquals(occurrences.length, 1);
});

Deno.test("dedupe: HTML where stripped text already names the gateway is not appended again", () => {
  const raw = `<span>Pay via Snapmint</span><img src="https://assets.snapmint.com/logo.png" alt="Snapmint" />`;
  assertEquals(htmlToLabel(raw), "Pay via Snapmint");
});

Deno.test("dedupe: already-clean SQL-backfilled value passes through unchanged", () => {
  // This is exactly the shape the SQL backfill wrote to old rows.
  const clean = "0% EMI on UPI Pay via Snapmint";
  assertEquals(htmlToLabel(clean), clean);
});

Deno.test("dedupe: alt text carries the gateway name so hostname is not re-appended", () => {
  const raw = `<span>Pay now</span><img src="https://cdn.example.com/x.png" alt="Razorpay" />`;
  // 'Razorpay' comes from alt; hostname 'example' must NOT get appended too.
  const out = htmlToLabel(raw);
  assertEquals(out, "Pay now — Pay via Razorpay");
  assertEquals((out.match(/Pay via/gi) ?? []).length, 1);
});

Deno.test("dedupe: plain text containing the gateway name is left alone", () => {
  assertEquals(htmlToLabel("Snapmint — 0% EMI"), "Snapmint — 0% EMI");
});

Deno.test("dedupe: whitespace-only tags collapse to fallback", () => {
  assertEquals(htmlToLabel("<span>   </span>", "cod"), "cod");
});