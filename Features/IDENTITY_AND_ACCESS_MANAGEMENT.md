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
14. [Implementation Phases](#14-implementation-phases)
15. [Known Gaps & Remediation](#15-known-gaps--remediation)
16. [Security Checklist](#16-security-checklist)

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

### 1.3 Invitation Flow

```
Admin creates invitation (user_invitations table)
  → approve-invitation edge function called
    → Auth user created (admin API)
    → Profile created (is_approved = true)
    → Employee record created
    → Role assigned
    → Password reset email sent
  → User clicks link → sets password → signs in
```

### 1.4 Session Lifecycle

| Event | Behavior |
|---|---|
| Sign in | JWT issued, profile + roles fetched, session recorded in `user_sessions` |
| Token refresh | Automatic via Supabase SDK |
| Sign out | `supabase.auth.signOut()` — clears local state, marks session inactive |
| Idle timeout | Managed by Supabase token expiry |
| Session revoke | User can revoke individual sessions from Security Settings |

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
| `validate_admin_registration(email)` | `SECURITY DEFINER` | Validates admin signup (whitelist + count) |
| `can_register_as_admin(email)` | `SECURITY DEFINER` | Checks admin whitelist membership |
| `is_hr_or_admin(_user_id)` | `SECURITY DEFINER` | Combined HR/Admin check for HR features |

All functions use `SET search_path TO 'public'` to prevent schema poisoning.

### 2.4 Admin Whitelist

- Stored in `admin_whitelist` table
- Only whitelisted emails can register as admin
- Hard cap of **5 admin accounts** enforced server-side
- Whitelist managed by existing admins

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

Most RLS policies include:
```sql
is_user_approved(auth.uid()) = true
```

---

## 4. Profile Dropdown — Account Control Center

### Current State
- Sign Out only

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

### SSO Scenario
- If SSO is the primary auth method, show redirect to provider's account management page
- Display message: "Password is managed by your identity provider"

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
| avatar_url | TEXT | **NEW** — Profile photo URL |
| reporting_manager_id | UUID | Optional hierarchy |
| slack_user_id | TEXT | Slack integration |

### `user_roles`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | References auth user (not FK) |
| role | `app_role` enum | One of 7 roles |
| created_at | TIMESTAMPTZ | Auto-set |

> **Design decision**: No foreign key to `auth.users` — prevents coupling to managed auth schema.

### `user_settings` ✨ NEW

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

### `user_sessions` ✨ NEW

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

### `login_history` ✨ NEW

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

### `security_audit_log` ✨ NEW

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

**Immutability:** No UPDATE or DELETE policies on `security_audit_log` or `login_history`.

### `org_settings` ✨ NEW

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
| Expenses | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
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

## 14. Implementation Phases

### Phase 1 — Core Identity (Priority)
- [ ] Restructure profile dropdown (3 sections with separators)
- [ ] My Profile page (view + edit name + avatar)
- [ ] Change Password (with strength indicator)
- [ ] Preferences (theme, compact mode)
- [ ] Wire `user_settings` table

### Phase 2 — Security & Sessions
- [ ] Security Settings page
- [ ] Active Sessions (view + revoke)
- [ ] Login History (last 10 records)
- [ ] Session tracking on sign-in (populate `user_sessions`)
- [ ] Login attempt logging (populate `login_history`)

### Phase 3 — Activity & Notifications
- [ ] My Activity page (aggregated from `user_activity_logs` + `edit_history`)
- [ ] Notification preferences UI
- [ ] Wire notification toggles to `user_settings`

### Phase 4 — Admin & MFA
- [ ] Admin audit logs page (filter by user, date, module)
- [ ] Organization Settings page
- [ ] MFA enrollment/unenrollment
- [ ] CSV export for audit logs

---

## 15. Known Gaps & Remediation

| Gap | Risk | Status |
|---|---|---|
| MFA not enforced for admins | Account takeover risk | ⚠️ Planned (Phase 4) |
| No IP-based session binding | Session hijacking | ⚠️ Mitigated by session tracking |
| `demand_forecasts` missing `is_user_approved()` | Unapproved users can read forecasts | 🔴 Fix pending |
| `payment_risk_scores` missing `is_user_approved()` | Unapproved users can read risk data | 🔴 Fix pending |
| 26 RLS policies with `USING (true)` | Over-permissive access on some tables | 🟡 Audit required |
| Profile dropdown is Sign Out only | No self-service account management | 🔵 This spec |

---

## 16. Security Checklist

### Identity & Access
- [x] Roles stored in dedicated `user_roles` table (not in profiles)
- [x] `has_role()` is `SECURITY DEFINER` with explicit `search_path`
- [x] `is_user_approved()` is `SECURITY DEFINER` with explicit `search_path`
- [x] Admin count hard-capped at 5 (server-side)
- [x] Admin whitelist enforced before admin registration
- [x] Service role key never exposed to client
- [x] Invitation flow creates user + profile + role atomically
- [x] Password reset uses single token (no dual-token invalidation)

### New IAM Tables
- [x] `user_settings` — RLS: own records only, approved users
- [x] `user_sessions` — RLS: own records + admin view all
- [x] `login_history` — RLS: own records + admin view all, immutable
- [x] `security_audit_log` — RLS: own records + admin view all, immutable (no UPDATE/DELETE)
- [x] `org_settings` — RLS: all approved can read, admin can write

### Pending
- [ ] MFA enforced for admin accounts
- [ ] Session idle timeout configured
- [ ] All RLS policies include `is_user_approved()` check
- [ ] Profile photo storage bucket created with proper RLS
- [ ] Login attempt tracking wired to auth flow
