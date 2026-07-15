import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { matchNames, matchBestName } from "../name-match.ts";

Deno.test("exact match", () => {
  const r = matchNames("Rahul Kumar Sharma", "Rahul Kumar Sharma");
  assertEquals(r.matches, true);
  assertEquals(r.score, 1);
});

Deno.test("case + honorific insensitive", () => {
  const r = matchNames("MR. RAHUL SHARMA", "rahul sharma");
  assert(r.matches, `expected match, got ${r.score}`);
});

Deno.test("word order insensitive", () => {
  const r = matchNames("Sharma Rahul Kumar", "Rahul Kumar Sharma");
  assert(r.matches);
});

Deno.test("middle initial matches full middle name", () => {
  const r = matchNames("Rahul K Sharma", "Rahul Kumar Sharma");
  assert(r.matches, `initial should match middle name, got ${r.score}`);
});

Deno.test("clearly different names do NOT match", () => {
  const r = matchNames("Rahul Sharma", "Priya Verma");
  assertEquals(r.matches, false);
});

Deno.test("empty inputs never match", () => {
  assertEquals(matchNames("", "Rahul").matches, false);
  assertEquals(matchNames("Rahul", null).matches, false);
});
// ── matchBestName — multi-candidate resolution (SATYAM KUMAR scenario) ────────

Deno.test("matchBestName: matches when primary is blank but contact full_name is right", () => {
  // Account primary_contact_name blank/stale; contact.full_name is the real name.
  const r = matchBestName("SATYAM KUMAR", [null, "", "SATYAM KUMAR"]);
  assert(r.matches, `expected match, got ${r.score}`);
  assertEquals(r.matchedCandidate, "SATYAM KUMAR");
});

Deno.test("matchBestName: picks the best candidate, ignores the wrong ones", () => {
  const r = matchBestName("SATYAM KUMAR", ["Barnwal Traders", "Satyam Kumar Barnwal", null]);
  assert(r.matches, `a same-person variant should match, got ${r.score}`);
});

Deno.test("matchBestName: no candidate matches → mismatch", () => {
  const r = matchBestName("SATYAM KUMAR", ["Priya Verma", "Acme Corp", null]);
  assertEquals(r.matches, false);
});

Deno.test("matchBestName: all-empty candidates never match", () => {
  const r = matchBestName("SATYAM KUMAR", [null, "", "   "]);
  assertEquals(r.matches, false);
  assertEquals(r.matchedCandidate, null);
});
