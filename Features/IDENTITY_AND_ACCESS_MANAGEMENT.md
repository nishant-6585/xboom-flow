# XBoom Workflow — Identity & Access Management (IAM)

> Who are you? Prove it. What can you touch? Only what you're supposed to.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Authorization — RBAC](#2-authorization--role-based-access-control-rbac)
3. [User Approval Gate](#3-user-approval-gate)
4. [Profile Dropdown — Account Control Center](#4-profile-dropdown--account-control-center)
5. [My Profile Page](#5-my-profile-page)
6. [Change Password](#6-change-password)
7. [Security Settings](#7-security-settings)
8. [My Activity](#8-my-activity)
9. [Notifications & Preferences](#9-notifications--preferences)
10. [Admin-Only Section](#10-admin-only-section-rbac-controlled)
11. [Data Model](#11-data-model)
12. [Access Control Matrix](#12-access-control-matrix)
13. [IDOR Prevention & Edge Function Auth](#13-idor-prevention--edge-function-auth)
14. [RLS Policy Standard](#14-rls-policy-standard)
15. [Security Hardening Log](#15-security-hardening-log)
16. [Implementation Phases](#16-implementation-phases)
17. [Known Gaps & Remediation](#17-known-gaps--remediation)
18. [Security Checklist](#18-security-checklist)

---

## 1. Authentication

### 1.1 Auth Provider

| Setting | Value |
|---|---|
| Provider | Lovable Cloud (Supabase Auth) |
| Method | Email + Password |
| Token type | JWT (short-lived, auto-refreshed) |
| Session storage | In-memory via Supabase SDK (not localStorage) |
| Email confirmation | Required before first sign-in |
| Password reset | Recovery email → `/auth` redirect |

### 1.2 Sign-Up Flow

```
User submits email + password + name + team
  │
  ├─ Has pending invitation? → Use invited role, auto-approve
  │
  ├─ Requesting admin? → Server-side validation:
  │     ├─ Email in admin_whitelist? (via `can_register_as_admin()`)
  │     ├─ Admin count < 5? (via `validate_admin_registration()`)
  │     └─ Fail → Rejected with reason
  │
  └─ Standard user → Requires manual admin approval
```

### 1.3 Invitation Flow (Transactional)

```
Admin creates invitation (user_invitations table)
  → approve-invitation edge function called
    → BEGIN TRANSACTION (atomic):
      → Auth user created (admin API)
      → Profile created (is_approved = true)
      → Employee record created
      → Role assigned
      → Password reset email sent
    → COMMIT (or full ROLLBACK on any failure)
  → User clicks link → sets password → signs in
```

> **Requirement (Item 7):** The entire invitation flow MUST be transactional.
> If any step fails (profile creation, role assignment, employee record), the entire
> operation must roll back. The edge function must use service role client with
> explicit error checking at each step, rolling back auth user creation on failure.

### 1.4 Session Lifecycle

| Event | Behavior |
|---|---|
| Sign in | JWT issued, profile + roles fetched, session recorded in `user_sessions` |
| Token refresh | Automatic via Supabase SDK — does **NOT** reset idle timer |
| Sign out | `supabase.auth.signOut()` — marks session inactive with `revocation_reason = 'SIGNED_OUT'` |
| Idle timeout | **12 hours** of no user-initiated activity → forced logout |
| Absolute timeout | **5 calendar days** from login → forced logout regardless of activity |
| Session revoke | User can revoke individual sessions from Security Settings |

### 1.4.1 Session Lifecycle Policy ✅ (Implemented)

> **Bounded exposure window** — no session can live indefinitely.

#### Timeouts

| Policy | Value | Enforcement |
|---|---|---|
| Idle Timeout | **12 hours** since last user-initiated activity | Client-side validation every 60s via `useSessionPolicy` |
| Absolute Timeout | **5 calendar days** from `session_started_at` | Client-side validation every 60s via `useSessionPolicy` |

#### Activity Definition

"Activity" = a **user-initiated interaction** (click, keypress, form submit). The following do **NOT** reset the idle timer:
- Automatic JWT token refresh
- Passive page loads without interaction
- Silent SDK operations

Activity updates are debounced (30s window) to reduce DB writes.

#### Enforcement

The `useSessionPolicy` hook runs inside `ProtectedRoute` and:
1. Validates the session immediately on mount
2. Re-validates every 60 seconds
3. Updates `last_activity_at` on real user interactions (debounced)

```
Fetch session WHERE user_id = current AND is_current = true
├─ No record → FORCE LOGOUT (fail-closed)
├─ revoked_at IS NOT NULL → FORCE LOGOUT
├─ now() - started_at > 5 days → ABSOLUTE_TIMEOUT
├─ now() - last_active_at > 12h → IDLE_TIMEOUT
└─ Valid → update last_activity_at
```

#### Revocation Reasons

| Code | Trigger |
|---|---|
| `IDLE_TIMEOUT` | No activity for 12h |
| `ABSOLUTE_TIMEOUT` | 5 days since login |
| `SIGNED_OUT` | User sign out |
| `USER_REVOKED` | Manual revocation |
| `PASSWORD_CHANGED` | Password change |

#### Audit

Timeout events logged to `security_audit_log` with action `SESSION_IDLE_TIMEOUT` or `SESSION_ABSOLUTE_TIMEOUT`, including device fingerprint.

#### Schema

```sql
ALTER TABLE user_sessions ADD COLUMN revocation_reason TEXT;
```

### 1.5 Login Rate Limiting & Account Lock

> **Requirement (Item 4):** Prevent brute force attacks on login.

| Rule | Value |
|---|---|
| Max failed attempts | **5** within **15 minutes** |
| Lockout duration | **30 minutes** |
| Lock status | Logged as `status = 'blocked'` in `login_history` |
| Admin override | Admin can manually unlock user |
| Enforcement | **Server-side** (edge function or auth hook) |

**Implementation spec (deferred to code phase):**
- On each login attempt, check `login_history` for recent failures
- If threshold exceeded, reject login with `account_locked` reason
- Log the blocked attempt
- Provide admin unlock endpoint

### 1.6 Session Security & Fingerprinting

> **Requirement (Item 5):** Bind sessions to device context.

| Feature | Implementation |
|---|---|
| Session binding | IP address + User-Agent fingerprint stored in `user_sessions` |
| Drift detection | On significant IP/UA change, flag session for re-auth |
| High-risk action guard | Role updates, org changes, password change require auth within **10 minutes** |
| Re-auth flow | Prompt password entry before proceeding with sensitive action |

---

## 2. Authorization — Role-Based Access Control (RBAC)

### 2.1 Role Model

**7 roles** defined as a PostgreSQL enum (`app_role`):

| Role | Scope | Max Count |
|---|---|---|
| `admin` | Full system access, user management, approvals | **5** (enforced) |
| `hr` | Employee management, attendance, leave, KPIs, documents | — |
| `finance` | Expenses, invoices, payments, procurement payments | — |
| `supply_chain` | Inventory, procurement, suppliers | — |
| `it` | IT tickets, system support | — |
| `marketing` | Marketing activities | — |
| `sales` | Enquiries, leads, orders, quotes, pipeline | — |

**Role priority** (for primary role selection when user has multiple):
```
admin > hr > finance > supply_chain > it > marketing > sales
```

### 2.2 Multi-Role Support

Users can hold **multiple roles** simultaneously. The system:
- Stores all roles in `user_roles` table (one row per role per user)
- Determines a **primary role** by priority for UI display
- Checks **any matching role** for access via `has_role()` function

### 2.3 Core Security Functions

| Function | Type | Purpose |
|---|---|---|
| `has_role(_user_id, _role)` | `SECURITY DEFINER` | Checks if user holds a specific role |
| `is_user_approved(_user_id)` | `SECURITY DEFINER` | Checks if user profile is approved |
| `is_hr_or_admin(_user_id)` | `SECURITY DEFINER` | Combined HR/Admin check for HR features |
| `validate_admin_registration(email)` | `SECURITY DEFINER` | Validates admin signup (whitelist + count) |
| `can_register_as_admin(email)` | `SECURITY DEFINER` | Checks admin whitelist membership |

All functions use `SET search_path TO 'public'` to prevent schema poisoning.

### 2.4 Admin Whitelist

- Stored in `admin_whitelist` table
- Only whitelisted emails can register as admin
- Hard cap of **5 admin accounts** enforced server-side
- Whitelist managed by existing admins

### 2.5 MFA Enforcement for Admin Role

> **Requirement (Item 3):** Admins MUST have MFA enabled.

| Rule | Behavior |
|---|---|
| Admin login without MFA enrolled | Redirect to MFA enrollment page, block app access |
| MFA bypass | **Not allowed** for admin accounts |
| MFA enable/disable | Logged in `security_audit_log` |
| Non-admin users | MFA optional (recommended) |

**Implementation spec (deferred to code phase):**
- After login, check if user `has_role(uid, 'admin')`
- If yes, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
- If `currentLevel < 'aal2'`, redirect to MFA enrollment
- Block all app routes until MFA is satisfied
- Log MFA state changes to `security_audit_log`

**UI Isolation Rule:**
- Application shell (sidebar, header, floating action buttons, attendance controls, command palette) is **not mounted** until MFA verification is complete.
- MFA enrollment and verification screens render in a standalone isolated layout (centered card, no app shell).
- The `AuthGuardedWidgets` component gates all global protected UI on `mfaStatus` in addition to authentication state.
- Deep links to protected routes while MFA is pending redirect to the MFA screen without rendering any protected components.

---

## 3. User Approval Gate

Every user must be **approved** before accessing the system.

| State | `is_approved` | Access |
|---|---|---|
| Pending | `false` | Blocked — sees "awaiting approval" screen |
| Approved | `true` | Full access per assigned role(s) |

### Who Gets Auto-Approved

| Scenario | Auto-Approved? |
|---|---|
| Admin-invited user (via invitation flow) | ✅ Yes |
| Whitelisted admin self-registering | ✅ Yes |
| Standard self-registration | ❌ No — requires admin approval |

### RLS Enforcement

**All** business table RLS policies include:
```sql
is_user_approved(auth.uid()) = true
```

---

## 4. Profile Dropdown — Account Control Center

### Target State — Structured Role-Aware Dropdown

```
┌──────────────────────────────┐
│  👤 User Name                │
│  role badge  •  email        │
├──────────────────────────────┤
│  SECTION 1 — Personal        │
│  ─────────────────────────── │
│  👤 My Profile               │
│  🔒 Security Settings        │
│  🔑 Change Password          │
│  📋 My Activity              │
│  🔔 Notifications            │
│  ⚙️  Preferences              │
├──────────────────────────────┤
│  SECTION 2 — Admin Only      │
│  (visible if role = admin)   │
│  ─────────────────────────── │
│  🏢 Organization Settings    │
│  👥 User Management          │
│  📜 Audit Logs               │
├──────────────────────────────┤
│  SECTION 3                   │
│  ─────────────────────────── │
│  🚪 Sign Out                 │
└──────────────────────────────┘
```

**Requirements:**
- Visual separators between sections
- Admin section conditionally rendered based on `has_role(uid, 'admin')`
- Role badge shows primary role
- Responsive — works on mobile as sheet/drawer

---

## 5. My Profile Page

**Route:** `/profile`

### Fields

| Field | Editable | Notes |
|---|---|---|
| Full Name | ✅ Yes | Updates `profiles.name` |
| Email | ❌ Read-only | Changed only by Admin |
| Role(s) | ❌ Read-only | Shows all assigned roles with badges |
| Department | ❌ Read-only | From `employees.department` |
| Employee ID | ❌ Read-only | From `employees.id` |
| Profile Photo | ✅ Yes | Upload to `avatars` storage bucket → `profiles.avatar_url` |

### Implementation Notes
- Profile photo stored in private `avatars` storage bucket
- RLS: users can only upload to `{user_id}/` folder
- Photo displayed in header avatar and profile page
- Name changes logged in `edit_history`

---

## 6. Change Password

**Route:** `/profile/change-password` or modal from dropdown

### Password-Based Auth Flow

| Field | Validation |
|---|---|
| Current Password | Required — verified server-side |
| New Password | Min 8 chars, uppercase, lowercase, number, special char |
| Confirm Password | Must match new password |

### Requirements
- **Strength indicator** (weak / fair / strong / very strong)
- **Server-side validation** via `supabase.auth.updateUser({ password })`
- **Invalidate all other sessions** on password change
- **Audit log entry** in `security_audit_log` (action: `password_change`)

---

## 7. Security Settings

**Route:** `/profile/security`

### 7A. Active Sessions

**Source:** `user_sessions` table

| Column | Display |
|---|---|
| device_info | Device name/type |
| browser | Browser name |
| os | Operating system |
| ip_address | IP (masked: `192.168.x.x`) |
| location | Approximate location |
| last_active_at | Last activity time |
| is_current | Badge: "Current Session" |

**Actions:**
- Revoke individual session → sets `is_active = false`, `revoked_at = now()`
- "Log out from all devices" → revokes all sessions except current
- All revocations logged in `security_audit_log`

### 7B. Multi-Factor Authentication (MFA)

| Feature | Implementation |
|---|---|
| Enable/Disable MFA | `supabase.auth.mfa.enroll()` / `unenroll()` |
| MFA Status | Badge showing enabled/disabled |
| OTP Support | TOTP via authenticator app |
| Recovery Codes | Generated on enrollment, shown once |

**Audit:** MFA enable/disable logged in `security_audit_log`

### 7C. Login History

**Source:** `login_history` table (last 10 records)

| Column | Display |
|---|---|
| attempted_at | Timestamp |
| status | Success ✅ / Failed ❌ / Blocked 🚫 |
| ip_address | IP address |
| browser | Browser |
| device_info | Device |
| failure_reason | Shown for failed attempts |

---

## 8. My Activity

**Route:** `/profile/activity`

**Source:** `user_activity_logs` + `edit_history` tables

Display recent actions performed by the logged-in user:
- Created order
- Updated attendance
- Modified settings
- Role changes (from `security_audit_log`)

**Requirements:**
- Minimum **20 records** displayed
- Sorted by latest first
- Paginated for historical access
- Only own records (enforced by RLS)

---

## 9. Notifications & Preferences

### 9A. Notification Settings

**Source:** `user_settings` table → `email_notifications` JSONB field

| Category | Email Toggle | In-App Toggle |
|---|---|---|
| Orders | ✅ Configurable | ✅ Configurable |
| Enquiries | ✅ Configurable | ✅ Configurable |
| Tasks | ✅ Configurable | ✅ Configurable |
| Attendance | ✅ Configurable | ✅ Configurable |
| System | ✅ Configurable | ✅ Configurable |
| Critical Alerts | 🔒 Always On | 🔒 Always On |

### 9B. Preferences

**Source:** `user_settings` table

| Setting | Values | Default |
|---|---|---|
| Theme | Light / Dark / System | Light |
| Compact Mode | On / Off | Off |
| Language | en (expandable) | en |

- Persisted per user in `user_settings`
- Applied on login via React context
- Theme toggles `dark` class on `<html>` element

---

## 10. Admin-Only Section (RBAC Controlled)

**Visibility:** Only if `has_role(auth.uid(), 'admin') = true`
**Enforcement:** Server-side RLS + client-side conditional rendering

### 10A. Organization Settings

**Route:** `/admin/organization` (existing Admin page, Organization tab)
**Source:** `org_settings` table

| Field | Editable | Notes |
|---|---|---|
| Organization Name | ✅ | `org_settings.org_name` |
| Logo | ✅ | Upload to storage → `org_settings.logo_url` |
| Timezone | ✅ | `org_settings.timezone` |
| Business Hours Start | ✅ | `org_settings.business_hours_start` |
| Business Hours End | ✅ | `org_settings.business_hours_end` |

### 10B. User Management

**Route:** `/admin` (existing Admin page)

Existing features:
- View all approved/pending users
- Assign/remove roles
- Approve/reject users
- Activate/deactivate users
- Manage departments and org roles

### 10C. Audit Logs

**Route:** `/admin/audit-logs`
**Sources:** `security_audit_log` + `edit_history` + `user_activity_logs`

| Filter | Options |
|---|---|
| User | Dropdown of all users |
| Date Range | Date picker |
| Module | Orders, HR, Finance, etc. |
| Action Type | Login, password_change, role_update, etc. |

**Requirements:**
- Admin-only access (RLS enforced)
- Exportable to CSV
- Paginated with search
- No UPDATE or DELETE on audit tables (immutable)

---

## 11. Data Model

### `profiles` (updated)

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | References auth user (not FK) |
| name | TEXT | Display name |
| email | TEXT | Normalized to lowercase |
| is_approved | BOOLEAN | Default `false` |
| avatar_url | TEXT | Profile photo URL |
| reporting_manager_id | UUID | Optional hierarchy |
| slack_user_id | TEXT | Slack integration |

### `user_roles`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | References auth user (not FK) |
| role | `app_role` enum | One of 7 roles |
| created_at | TIMESTAMPTZ | Auto-set |

### `user_settings`

| Column | Type | Default | Notes |
|---|---|---|---|
| id | UUID (PK) | Auto-generated | |
| user_id | UUID (UNIQUE) | — | One row per user |
| theme | TEXT | `'light'` | `light`, `dark`, `system` |
| compact_mode | BOOLEAN | `false` | |
| language | TEXT | `'en'` | |
| email_notifications | JSONB | `{orders: true, ...}` | Per-category toggles |
| in_app_notifications | BOOLEAN | `true` | |
| critical_alerts | BOOLEAN | `true` | Cannot be disabled via UI |

### `user_sessions`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | Session owner |
| session_token_hash | TEXT | Hash of JWT (never raw token) |
| device_info | TEXT | Parsed from user agent |
| browser | TEXT | Chrome, Firefox, etc. |
| os | TEXT | Windows, macOS, etc. |
| ip_address | TEXT | Client IP |
| location | TEXT | Approximate from IP |
| is_current | BOOLEAN | Marks the current session |
| started_at | TIMESTAMPTZ | Session start |
| last_active_at | TIMESTAMPTZ | Last activity |
| revoked_at | TIMESTAMPTZ | When revoked (null if active) |
| is_active | BOOLEAN | `false` when revoked/expired |

### `login_history` (IMMUTABLE)

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID (nullable) | Null for failed attempts with unknown user |
| email | TEXT | Login email attempted |
| status | TEXT | `success`, `failed`, `blocked`, `mfa_required` |
| failure_reason | TEXT | e.g. `invalid_password`, `account_locked` |
| ip_address | TEXT | Client IP |
| user_agent | TEXT | Raw user agent string |
| device_info | TEXT | Parsed device |
| browser | TEXT | Parsed browser |
| os | TEXT | Parsed OS |
| location | TEXT | Approximate from IP |
| attempted_at | TIMESTAMPTZ | Timestamp |

> **No UPDATE or DELETE policies.** This table is append-only.

### `security_audit_log` (IMMUTABLE)

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | Who performed the action |
| user_name | TEXT | Snapshot of name at action time |
| action | TEXT | `password_change`, `mfa_enable`, `session_revoke`, `role_update`, etc. |
| target_user_id | UUID (nullable) | For admin actions on other users |
| details | JSONB | Additional context |
| ip_address | TEXT | Client IP |
| user_agent | TEXT | Raw user agent |
| performed_at | TIMESTAMPTZ | Timestamp |

> **No UPDATE or DELETE policies.** This table is append-only.

### `org_settings`

| Column | Type | Default | Notes |
|---|---|---|---|
| id | UUID (PK) | Auto-generated | Single row |
| org_name | TEXT | `'XBoom'` | Organization name |
| logo_url | TEXT | null | Uploaded logo |
| timezone | TEXT | `'Asia/Kolkata'` | |
| business_hours_start | TEXT | `'09:00'` | |
| business_hours_end | TEXT | `'18:00'` | |

### `user_invitations` (existing)

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| name | TEXT | Invitee name |
| email | TEXT | Invitee email |
| role | TEXT | Assigned role |
| department | TEXT | Default: 'General' |
| status | TEXT | `pending` → `accepted` |
| invited_by | UUID | Admin who invited |
| accepted_at | TIMESTAMPTZ | When accepted |

### `admin_whitelist` (existing)

| Column | Type | Notes |
|---|---|---|
| email | TEXT (PK) | Authorized admin email |
| added_by | UUID | Who added |
| added_at | TIMESTAMPTZ | When added |

---

## 12. Access Control Matrix

| Resource | admin | hr | finance | supply_chain | sales | it | marketing |
|---|---|---|---|---|---|---|---|
| User management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Organization settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logs (system-wide) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Own profile / settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Own security settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Own activity log | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| All user sessions | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| All login history | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Enquiries / Leads | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Orders | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Invoices / Quotes | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Expenses | ✅ | ❌ | ✅ | ❌ | own | ❌ | ❌ |
| Inventory | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Procurement | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Suppliers | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Supplier bank details | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Attendance | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Leave management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| KPIs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| HR Documents | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tickets | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Payment screenshots | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Demand forecasts | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Payment risk scores | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Petty cash | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inventory alerts | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Margin thresholds | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 13. IDOR Prevention & Edge Function Auth

### IDOR Prevention

All data access enforced through **Row-Level Security (RLS)**:
1. Verify `auth.uid()` matches the requesting user
2. Check role via `has_role(auth.uid(), 'role_name')`
3. Verify approval via `is_user_approved(auth.uid())`
4. Scope data to user's organization context

### Edge Function Auth

All edge functions validate JWT before processing:
```typescript
const authHeader = req.headers.get("Authorization");
const { data: { user }, error } = await supabase.auth.getUser(
  authHeader?.replace("Bearer ", "")
);
if (!user) return new Response("Unauthorized", { status: 401 });
```

Service role key is used **only** in edge functions — **never** exposed to client.

---

## 14. RLS Policy Standard

> **Requirement (Item 8):** All new and existing RLS policies must follow this standard.

### Mandatory Policy Template

Every RLS policy on a business table MUST include:

```sql
-- SELECT policy template
CREATE POLICY "descriptive_name"
  ON public.table_name FOR SELECT TO authenticated
  USING (
    is_user_approved(auth.uid())                    -- 1. Approval gate
    AND (                                            -- 2. Role validation
      has_role(auth.uid(), 'admin') OR
      has_role(auth.uid(), 'relevant_role') OR
      owner_column = auth.uid()                      -- 3. User scoping
    )
  );

-- INSERT policy template
CREATE POLICY "descriptive_name"
  ON public.table_name FOR INSERT TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())                    -- 1. Approval gate
    AND owner_column = auth.uid()                    -- 2. Creator validation
  );

-- UPDATE/DELETE policy template
CREATE POLICY "descriptive_name"
  ON public.table_name FOR UPDATE TO authenticated
  USING (
    is_user_approved(auth.uid())                    -- 1. Approval gate
    AND (
      has_role(auth.uid(), 'admin') OR
      owner_column = auth.uid()                      -- 2. Owner or admin
    )
  );
```

### Prohibited Patterns

| Pattern | Status | Reason |
|---|---|---|
| `USING (true)` on INSERT/UPDATE/DELETE | 🚫 **BANNED** | Allows any user to modify data |
| `WITH CHECK (true)` on INSERT | 🚫 **BANNED** | No ownership validation |
| `USING (true)` on SELECT for business data | 🚫 **BANNED** | Leaks data to unapproved users |
| Missing `is_user_approved()` | 🚫 **BANNED** | Unapproved users can access data |
| Role checks in client-side only | 🚫 **BANNED** | Easily bypassed |

### Allowed Exceptions

| Exception | Justification |
|---|---|
| `form_views` INSERT with `USING (true)` | Public form view tracking (anonymous users) |
| `drone_repair_enquiries` INSERT with `USING (true)` | Public repair enquiry submission |
| `form_submissions` INSERT with `USING (true)` | Public form submission |
| `USING (true)` on SELECT for reference data | Only if `is_user_approved()` is included |

### Migration-Level Validation

When creating new migrations with RLS policies:
1. **Review checklist** before committing:
   - [ ] Does every policy include `is_user_approved(auth.uid())`?
   - [ ] Are INSERT policies scoped to `owner_column = auth.uid()`?
   - [ ] Are sensitive tables role-restricted via `has_role()`?
   - [ ] Are audit tables immutable (no UPDATE/DELETE policies)?
2. **Run linter** after migration to verify no new `USING (true)` warnings

---

## 15. Security Hardening Log

### Hardening Round 1 — 2026-02-24

**Scope:** Remove all `USING (true)` / `WITH CHECK (true)` policies on 21 business tables.

| # | Table | Change | New Policy |
|---|---|---|---|
| 1 | `demand_forecasts` | Removed `ALL` with `true` | SELECT: admin, finance, supply_chain + approved |
| 2 | `payment_risk_scores` | Removed `ALL` with `true` | SELECT: admin, finance + approved |
| 3 | `forecast_accuracy_log` | Removed `ALL` with `true` | SELECT: admin, finance, supply_chain + approved |
| 4 | `payment_risk_accuracy_log` | Removed `ALL` with `true` | SELECT: admin, finance + approved |
| 5 | `ai_scoring_logs` | Replaced SELECT/INSERT | approved users only |
| 6 | `attendance_audit_log` | Replaced INSERT `true` | SELECT: admin/hr + approved |
| 7 | `domain_events` | Replaced SELECT/INSERT/UPDATE | approved users only |
| 8 | `duplicate_alerts` | Replaced SELECT/INSERT/UPDATE | approved users only |
| 9 | `expense_order_links` | Replaced SELECT/INSERT/DELETE | admin/finance + approved |
| 10 | `expense_procurement_links` | Replaced SELECT/INSERT/DELETE | admin/finance/supply_chain + approved |
| 11 | `expenses` | Replaced SELECT/INSERT | creator + admin/finance can view; creator-scoped insert |
| 12 | `imports` | Replaced all CRUD | creator + admin/supply_chain scoped |
| 13 | `import_items` | Replaced all CRUD | parent import owner + admin/supply_chain (Tightened Round 2) |
| 14 | `inventory_alert_logs` | Replaced SELECT/INSERT | admin/supply_chain + approved |
| 15 | `inventory_sync_settings` | Replaced SELECT | admin/supply_chain + approved |
| 16 | `margin_thresholds` | Replaced SELECT | admin/finance/supply_chain + approved |
| 17 | `org_departments` | Replaced SELECT | approved users (reference data) |
| 18 | `org_roles` | Replaced SELECT | approved users (reference data) |
| 19 | `petty_cash_transactions` | Replaced SELECT | admin/finance + approved |
| 20 | `pipeline_tags` | Replaced SELECT | approved users (reference data) |
| 21 | `quote_risk_flags` | Replaced SELECT/INSERT | approved users only |

**Additional fixes:**
- Fixed `generate_quote_number()` — added `SET search_path TO 'public'`
- Fixed `generate_invoice_number()` — added `SET search_path TO 'public'`
- Verified `security_audit_log` and `login_history` have no UPDATE/DELETE policies (immutable)

**Remaining intentional public policies (3):**
- `drone_repair_enquiries` INSERT — public repair form
- `form_views` INSERT (×2) — public form view tracking

**Linter results:** 33 warnings → 8 (4 security definer views, 1 extension in public, 3 intentional public policies)

### Hardening Round 2 — 2026-02-24

**Scope:** Resolve 4 Security Definer Views + tighten `import_items` scoping.

| # | Item | Change | Result |
|---|---|---|---|
| 1 | `forms_public` view | Converted to `SECURITY INVOKER` | Queries now respect `forms` table RLS (public SELECT preserved via existing policy) |
| 2 | `invoice_aging_view` view | Converted to `SECURITY INVOKER` | Only approved users see aging data |
| 3 | `pricelist_public` view | Added approved-user SELECT on `pricelist` + converted to `SECURITY INVOKER` | All approved users can read pricelist; admin/supply_chain retain full CRUD |
| 4 | `sales_weighted_forecast_view` view | Converted to `SECURITY INVOKER` | Sales sees own pipeline, admin/supply_chain see all |
| 5 | `import_items` | Replaced "approved users only" → parent import owner scoping | SELECT/INSERT/UPDATE/DELETE scoped via `EXISTS` on parent `imports.created_by` |

**"Approved Users Only" Table Classification:**
| Table | Classification | Justification |
|---|---|---|
| `org_departments` | ✅ Org-wide reference data | All users need dropdown values |
| `org_roles` | ✅ Org-wide reference data | All users need dropdown values |
| `pipeline_tags` | ✅ Reference data + owner-scoped write | Tags are shared; creation/deletion scoped |
| `domain_events` | ✅ Org-wide operational log | Event sourcing — cross-team visibility needed |
| `duplicate_alerts` | ✅ Operational awareness | Read-only for detection; write scoped |
| `quote_risk_flags` | ✅ Operational with admin/finance write restriction | Read broad, write restricted |

**Linter results:** 8 → 4 (0 security definer view errors, 1 extension in public, 3 intentional public policies)

---

## 16. Implementation Phases

### Phase 1 — Core Identity (Priority)
- [ ] Restructure profile dropdown (3 sections with separators)
- [ ] My Profile page (view + edit name + avatar)
- [ ] Change Password (with strength indicator)
- [ ] Preferences (theme, compact mode)
- [ ] Wire `user_settings` table

### Phase 2 — Security & Sessions
- [x] Security Settings page ✅ IMPLEMENTED
- [x] Active Sessions (view + revoke) ✅ IMPLEMENTED
- [x] Login History (last 10 records) ✅ IMPLEMENTED
- [x] Session tracking on sign-in (populate `user_sessions`) ✅ IMPLEMENTED
- [x] Login attempt logging (populate `login_history`) ✅ IMPLEMENTED
- [x] Login rate limiting (5 attempts / 15 min → 15 min lock) ✅ IMPLEMENTED
- [x] Session fingerprinting (browser + OS + device type) ✅ IMPLEMENTED
- [ ] Session idle timeout configured

### Phase 3 — Activity & Notifications
- [ ] My Activity page (aggregated from `user_activity_logs` + `edit_history`)
- [ ] Notification preferences UI
- [ ] Wire notification toggles to `user_settings`

### Phase 4 — Admin, MFA & Hardening
- [ ] Admin audit logs page (filter by user, date, module)
- [ ] Organization Settings page
- [x] MFA enrollment/unenrollment ✅ IMPLEMENTED
- [x] MFA enforcement for admin role (block access without MFA) ✅ IMPLEMENTED
- [ ] Transactional invitation flow (atomic rollback)
- [ ] High-risk action re-authentication guard
- [ ] CSV export for audit logs

---

## 17. Known Gaps & Remediation

| Gap | Risk | Status |
|---|---|---|
| MFA not enforced for admins | Account takeover risk | ✅ **FIXED** — MFA enrollment + verification enforced in ProtectedRoute |
| No IP-based session binding | Session hijacking | ✅ **FIXED** — Session fingerprinting (browser/OS/device) recorded on login |
| `demand_forecasts` missing `is_user_approved()` | Unapproved users can read forecasts | ✅ **FIXED** (Hardening Round 1) |
| `payment_risk_scores` missing `is_user_approved()` | Unapproved users can read risk data | ✅ **FIXED** (Hardening Round 1) |
| 26 RLS policies with `USING (true)` | Over-permissive access | ✅ **FIXED** — reduced to 3 intentional public policies |
| Profile dropdown is Sign Out only | No self-service account management | ⚠️ Planned (Phase 1) |
| Login rate limiting not implemented | Brute force vulnerability | ✅ **FIXED** — 5 attempts / 15 min window, DB functions |
| Invitation flow not transactional | Partial state on failure | ⚠️ Planned (Phase 4) — spec defined in §1.3 |
| 4 Security Definer Views | RLS bypass risk | ✅ **FIXED** (Hardening Round 2) — all converted to SECURITY INVOKER |
| `pg_trgm` in public schema | Extension misplacement | 🟡 Low risk — move to `extensions` schema |
| `generate_quote_number` missing search_path | Schema poisoning risk | ✅ **FIXED** (Hardening Round 1) |
| `generate_invoice_number` missing search_path | Schema poisoning risk | ✅ **FIXED** (Hardening Round 1) |

---

## 18. Security Checklist

### Identity & Access
- [x] Roles stored in dedicated `user_roles` table (not in profiles)
- [x] `has_role()` is `SECURITY DEFINER` with explicit `search_path`
- [x] `is_user_approved()` is `SECURITY DEFINER` with explicit `search_path`
- [x] Admin count hard-capped at 5 (server-side)
- [x] Admin whitelist enforced before admin registration
- [x] Service role key never exposed to client
- [x] Password reset uses single token (no dual-token invalidation)

### RLS Hardening ✅ COMPLETED
- [x] **No `USING (true)` on INSERT/UPDATE/DELETE** (except 3 intentional public policies)
- [x] **All business tables include `is_user_approved()` check**
- [x] Sensitive data (forecasts, risk scores) restricted by role
- [x] Expense data scoped by creator + admin/finance
- [x] Import data scoped by creator + admin/supply_chain
- [x] Petty cash restricted to admin/finance
- [x] Attendance audit logs restricted to admin/hr
- [x] Inventory alerts restricted to admin/supply_chain

### Audit Log Immutability ✅ VERIFIED
- [x] `security_audit_log` — no UPDATE/DELETE policies
- [x] `login_history` — no UPDATE/DELETE policies
- [x] `attendance_audit_log` — no UPDATE/DELETE policies

### Function Security ✅ FIXED
- [x] All security functions use `SET search_path TO 'public'`
- [x] `generate_quote_number()` — search_path set
- [x] `generate_invoice_number()` — search_path set

### Pending Implementation
- [x] MFA enforced for admin accounts ✅
- [x] Login rate limiting (5 attempts / 15 min lock) ✅
- [x] Session fingerprint tracking active ✅
- [ ] Invitation flow wrapped in transaction (Phase 4)
- [ ] High-risk action re-authentication (Phase 4)
- [ ] Profile photo storage bucket created with proper RLS (Phase 1)
- [x] Login attempt tracking wired to auth flow ✅
- [x] Session tracking on sign-in ✅
- [ ] Session idle timeout configured (Phase 2)
- [x] Security Definer Views audited and converted to SECURITY INVOKER ✅
- [ ] `pg_trgm` moved to extensions schema (Backlog)
