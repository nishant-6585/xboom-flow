
## Ticket Inbox: collaboration upgrade

### 1. Notification Config admin page
New route `/admin/portal-tickets/notification-config` linked from a "Notification config" button on the Ticket Inbox header.

Shows two panels reflecting the current `notify_sales_on_portal_ticket_created` trigger logic:

- **Website / "Vishal" orders** → notified: all users with `admin`, `sales_manager`, or `supply_chain` roles. Lists each recipient (name, email, role badges) so you can confirm Sanu Sabu is in supply_chain.
- **Manual orders** → notified: the order's assigned salesperson.

Also shows a "Test scope" input (order number). Enter one and it looks up the order and shows who *would* be notified for that specific order today, so troubleshooting is a single query away.

Read-only page. No schema changes.

### 2. Per-user read indicators on rows
Each row in the inbox shows small avatars/initials of internal users who have read the ticket, with a tooltip listing name + last read timestamp. Powered by a new lightweight RPC `list_portal_ticket_reads(_ticket_ids uuid[])` that returns `{ticket_id, user_id, display_name, last_read_at}` joined against `profiles`, restricted to internal staff.

The inbox page batch-fetches reads for currently visible ticket IDs and renders up to 3 avatars per row plus a "+N" overflow badge.

### 3. Quick reply from row
Each row gets an expandable "Quick reply" panel (chevron toggle) with:
- textarea for reply body
- **Send reply** button (inserts into `portal_ticket_messages` and fires `notifyPortal('ticket_message_added')`, same as detail view)
- **Set status** dropdown (open / in_progress / awaiting_customer / resolved / closed) — updates via existing `portal_tickets.update` + `notifyPortal('ticket_status_changed')`

Sales/supply chain reply and change status without leaving the inbox.

### 4. Filter controls
Split the current single search into dedicated inputs on the toolbar:
- Order # (matches `related_order_number`)
- Customer email (matches `customer_email`)
- Status select (already present; kept)
- A general "keyword" search stays for subject/company/item

All filters compose client-side against the existing RPC output.

### 5. Automated UI test
New vitest+RTL test `PortalTicketsAdmin.bulkRead.test.tsx` that:
- Mocks the `list_portal_ticket_inbox` RPC to return 3 rows, two with unread counts.
- Renders the page.
- Selects two rows via row checkboxes.
- Clicks **Mark as read**.
- Asserts:
  - `supabase.rpc('mark_portal_tickets_read', { _ticket_ids: [...2 ids] })` was called.
  - Success toast fired.
  - Inbox refetch queued (queryClient invalidation observed).
  - After refetch (mocked with unread=0), amber "new from customer" badges no longer render.

### Technical notes
- New migration adds only `list_portal_ticket_reads(uuid[])` (SECURITY DEFINER, restricted to internal staff via `is_internal_staff()`).
- `PortalTicketsAdmin.tsx` refactored: filter toolbar, expandable rows, avatar strip. Existing bulk toolbar and RPCs untouched.
- New file `src/pages/admin/PortalTicketNotificationConfig.tsx` + route in `App.tsx`.
- Test uses shared `createSupabaseMock` pattern already in `__tests__`.
