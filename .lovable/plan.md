## TV View — Auto-Rotating Sales Scoreboard

A full-screen, kiosk-style dashboard that cycles through 4 metric screens automatically (30s each), styled like a sports stadium scoreboard. Opens in a new browser tab from a button on the Sales dashboard.

### Entry point
- Rename the existing `TV Dashboard` button in `ManagerDashboard.tsx` (top header, next to Download PDF) to **TV View** with a `Tv` icon.
- Click opens `/sales/tv` in a new tab (`window.open(..., '_blank')`).
- The new tab is chrome-free (no app header, no sidebar) — pure scoreboard.

### Route
- New route `/sales/tv` in `App.tsx`, wrapped in `ProtectedRoute` (auth required).
- Page component replaces the current static `SalesTvDashboard.tsx` with a rotating carousel.

### Screens (4, rotating every 30 s)
Each screen fills 1920×1080, optimized for a 55" TV. Bottom strip shows screen indicator dots, date-scope label (TODAY / MTD), live clock, and a thin animated progress bar showing time-until-next-screen.

1. **Headline KPIs** — five hero tiles in one row: Team Leads, Orders Won (+conv %), Order Value (₹ Cr), Pipeline (₹ Cr), Team Points. Big numbers, neon gradients per tile.
2. **Top Performers Leaderboard** — top 5 reps with podium-style rank badges (gold/silver/bronze), name, points, orders won, order value.
3. **Lead Sources** — five large pill cards (Enquiry, Calls, Forms, Email, Interakt) with counts + share-of-total bar.
4. **Lead Distribution by Rep** — horizontal bar chart of top 6 reps with leads count, % share, and source breakdown chips.

### Date scope toggle (Today ↔ MTD)
- The full 4-screen cycle runs once for **Today**, then once for **MTD**, then repeats.
- Current scope is shown prominently in the header chip and in the bottom strip.
- Uses existing `useSalesLeaderboard(startDate, endDate)` and `useLeadDistribution(startDate, endDate)` — both already accept date ranges; we just re-key them per scope.

### Style — Dark stadium
- Pure black background (`#05060a`), neon gradient tiles (cyan/emerald/purple/pink/amber), monospaced tabular numbers.
- Cross-fade transition between screens (`animate-fade-in` / `animate-fade-out`, 600ms).
- Subtle pulsing accents on KPI tiles.
- Screen indicator dots at the bottom; active dot glows.

### Auto behavior
- Rotates every **30 seconds**.
- Full data refresh every **5 minutes** (re-queries hooks, no page reload).
- Live clock ticks every second.
- Pauses rotation on hover (so someone walking up can study a screen); resumes on mouse leave.
- Keyboard: `←` / `→` to manually step, `Space` to pause/resume, `F` to toggle browser fullscreen.

### Files
- **Edit** `src/components/sales/ManagerDashboard.tsx` — rename button to "TV View".
- **Rewrite** `src/pages/SalesTvDashboard.tsx` — carousel orchestrator: scope toggle, timer, key handlers, screen renderer.
- **New** `src/pages/sales-tv/` directory with one component per screen:
  - `KpiScreen.tsx`
  - `LeaderboardScreen.tsx`
  - `LeadSourcesScreen.tsx`
  - `LeadDistributionScreen.tsx`
  - `TvFooter.tsx` (dots, clock, progress, scope chip)
- **No** changes to App.tsx routes (existing `/sales/tv` route is kept).
- **No** backend / DB changes — reuses existing hooks.

### Out of scope
- No PDF export, no editing, no filters on the TV page — it's purely a display surface.
- No new analytics queries; if a metric isn't in existing hooks, it isn't on the TV.
