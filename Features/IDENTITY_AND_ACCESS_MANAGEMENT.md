# XBoom Workflow — Identity & Access Management (IAM)

> Who are you? Prove it. What can you touch? Only what you're supposed to.

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
| Sign in | JWT issued, profile + roles fetched |
| Token refresh | Automatic via Supabase SDK |
| Sign out | `supabase.auth.signOut()` — clears local state |
| Idle timeout | Managed by Supabase token expiry |

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

All functions use `SET search_path TO 'public'` to prevent schema poisoning.

### 2.4 Admin Whitelist

- Stored in `admin_whitelist` table
- Only whitelisted emails can register as admin
- Hard cap of **5 admin accounts** enforced server-side
- Whitelist managed by existing admins

---

## 3. User Approval Gate

Every user must be **approved** before accessing the system.

### Approval States

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
This ensures unapproved users cannot read or write data even if authenticated.

---

## 4. Data Model

### `profiles`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | References auth user (not FK) |
| name | TEXT | Display name |
| email | TEXT | Normalized to lowercase |
| is_approved | BOOLEAN | Default `false` |
| reporting_manager_id | UUID | Optional hierarchy |
| slack_user_id | TEXT | Slack integration |

### `user_roles`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID | References auth user (not FK) |
| role | `app_role` enum | One of 7 roles |
| created_at | TIMESTAMPTZ | Auto-set |

> **Design decision**: No foreign key to `auth.users` — prevents coupling to Supabase-managed schema.

### `user_invitations`

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

### `admin_whitelist`

| Column | Type | Notes |
|---|---|---|
| email | TEXT (PK) | Authorized admin email |
| added_by | UUID | Who added |
| added_at | TIMESTAMPTZ | When added |

---

## 5. Access Control Matrix

| Resource | admin | hr | finance | supply_chain | sales | it | marketing |
|---|---|---|---|---|---|---|---|
| User management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
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

## 6. IDOR Prevention

All data access is enforced through **Row-Level Security (RLS)** policies that:

1. Verify `auth.uid()` matches the requesting user
2. Check role via `has_role(auth.uid(), 'role_name')`
3. Verify approval via `is_user_approved(auth.uid())`
4. Scope data to the user's organization context

> Users cannot access `/api/resource?id=X` by guessing IDs — RLS enforces server-side filtering regardless of client request.

---

## 7. Edge Function Auth

All edge functions validate the JWT before processing:

```typescript
const authHeader = req.headers.get("Authorization");
const { data: { user }, error } = await supabase.auth.getUser(
  authHeader?.replace("Bearer ", "")
);
if (!user) return new Response("Unauthorized", { status: 401 });
```

Service role key is used **only** in edge functions for admin operations (e.g., `auth.admin.createUser`). It is **never** exposed to the client.

---

## 8. Known Gaps & Remediation

| Gap | Risk | Status |
|---|---|---|
| MFA not enforced for admins | Account takeover risk | ⚠️ Planned |
| No IP-based session binding | Session hijacking | ⚠️ Not implemented |
| `demand_forecasts` missing `is_user_approved()` | Unapproved users can read forecasts | 🔴 Fix pending |
| `payment_risk_scores` missing `is_user_approved()` | Unapproved users can read risk data | 🔴 Fix pending |
| 26 RLS policies with `USING (true)` | Over-permissive access on some tables | 🟡 Audit required |

---

## 9. Security Checklist

- [x] Roles stored in dedicated `user_roles` table (not in profiles)
- [x] `has_role()` is `SECURITY DEFINER` with explicit `search_path`
- [x] `is_user_approved()` is `SECURITY DEFINER` with explicit `search_path`
- [x] Admin count hard-capped at 5 (server-side)
- [x] Admin whitelist enforced before admin registration
- [x] Service role key never exposed to client
- [x] Invitation flow creates user + profile + role atomically
- [x] Password reset uses single token (no dual-token invalidation)
- [ ] MFA enforced for admin accounts
- [ ] Session idle timeout configured
- [ ] All RLS policies include `is_user_approved()` check
