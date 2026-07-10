## Goal
Add at-a-glance analytics and filters to `/kyc` (KYC Verification Queue) similar to the Portal Customers page, so reviewers can slice the queue quickly.

## Scope
Frontend-only change to `src/pages/KycVerification.tsx`. No schema, no RLS, no API changes — data is already available from `useKycQueue`.

## 1. Analytics stat cards (top of page)
A row of compact cards computed from `rows`:

- **Total submissions** — `rows.length`
- **Pending review** — effective status `pending_verification`
- **Approved** — effective status `approved`
- **Rejected** — effective status `rejected`
- **DigiLocker** — `document.method === 'digilocker'` (auto-verified vs pending name-mismatch split shown as sub-line)
- **Manual upload** — `document.method !== 'digilocker'`
- **AI: likely approve / reject / unclear** — from `ai_review.recommendation` on pending rows
- **Today's uploads** — `kyc_submitted_at` within today

Cards are clickable → set the matching status/method filter.

## 2. Filter bar (above table, replacing the current single search input)
- Search (existing)
- Status: All / Pending / Approved / Rejected / Not submitted
- Document type: All / Aadhaar / PAN / Driving Licence / Voter ID / Passport / Rental Agreement / Other
- Method: All / DigiLocker / Manual
- Salesperson: All / (unique `rep_name` list from rows)
- AI recommendation: All / Likely approve / Likely reject / Unclear / No AI review
- Date range chips: All Time / Today / Yesterday / This Week / Last Week / This Month + custom From/To
- "Reset filters" button (only visible when any filter is active)

Result count updates the existing "{n} accounts" label.

## 3. Filtering logic
Extend the existing `useMemo(filtered, …)` to apply all filters in one pass, using the same "effective status" logic already in the table (per-submission status falls back to account status).

## 4. UI/styling
- Reuse existing `Card`, `Badge`, `Select`, `Input`, `Button` primitives — no new deps.
- Match the visual style of Portal Customers stat cards (label uppercase, big number, color hints: green for approved, orange for pending, red for rejected).
- Filter bar wraps on mobile.

## 5. Persistence (light)
Filter state stays in component state (not URL) to keep this change small; the existing `?account=` deep-link behavior is preserved.

## Out of scope
- CSV export
- Server-side pagination (queue is small, ~17 rows today)
- New DB columns or RPCs
