# Pipeline Follow-up Tracker

A dedicated **Follow-ups** tab inside the Pipeline module that turns follow-ups into a proper sequenced history (1st, 2nd, ... nth) per pipeline deal, so nothing goes cold silently.

## What you get

**New tab: "Follow-up Tracker"** (next to Pipeline List / Add Pipeline / Analytics / Calendar)

Top summary strip (respects filters):
- Overdue follow-ups, Due today, Due this week, Deals with zero follow-ups

Filters: search (company / customer / product), sales person, status bucket (Overdue, Today, Upcoming, No follow-up yet), pipeline status.

Main table — one row per pipeline deal:

```text
Company | Customer | Product | Lead Owner | Deal Value | Followups (#) | Last follow-up (date + mode + note) | Next due | Action
```

- Follow-up count badge shows the sequence number reached (e.g. "3rd done").
- Next due cell colour-coded: red = overdue, amber = today, green = upcoming, grey = none scheduled.
- Row click expands an inline timeline of every follow-up in order: #1, #2, #3... each showing date, mode, note, outcome, who logged it.

**Log follow-up dialog** (from the row action or the timeline):
- Date & time
- Mode: Call, WhatsApp, Email, Meeting, Site visit, Demo, Other
- Notes (free text + existing quick-note presets)
- Outcome: Interested / Negotiating / Awaiting PO / Awaiting payment / No response / Not interested
- Optional "Schedule next follow-up on" date — creates the next pending follow-up in one step, so the chain never breaks.

Existing pending follow-ups can be completed (with note + mode) or rescheduled from the same dialog.

## Technical notes

- Reuses the existing `followups` table with `source_type = 'pipeline'`, `source_id = pipeline_orders.id`, so all follow-ups already logged from the pipeline dialogs appear here immediately.
- Migration adds to `followups`: `mode text` (checked against the allowed modes), `outcome text`, and `sequence_no int` populated by a trigger (per source_type + source_id ordering by `followup_at`), plus a backfill for existing rows. Grants/RLS unchanged (policies already scope by owner/role).
- New RPC `get_pipeline_followup_tracker()` returning one row per pipeline deal with company, customer, product, owner, value, pipeline status, follow-up count, last follow-up (date/mode/note/outcome/by) and next pending due date — keeps the tab fast instead of fetching all follow-ups client-side. SECURITY INVOKER so existing RLS visibility rules apply (sales see their own, managers/admin see all).
- New files: `src/components/pipeline/PipelineFollowupTracker.tsx` (tab body + table + summary), `src/components/pipeline/PipelineFollowupTimeline.tsx` (expanded sequence view), `src/components/pipeline/LogPipelineFollowupDialog.tsx`, `src/hooks/usePipelineFollowupTracker.ts`.
- `PipelineOrders.tsx` gets the new `TabsTrigger` + `TabsContent`.
- `FollowupScheduleDialog` / `FollowupHistory` extended to pass through mode + outcome so the pipeline dialog and the tracker stay consistent.
