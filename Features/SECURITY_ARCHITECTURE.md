# XBoom Workflow — Security Architecture

> Think in layers. Security is onion architecture. Cry now so you don't cry later.

---

## Shared Responsibility Model

Security is split between **Platform (Lovable Cloud)** and **Application (XBoom team)**.

### Platform Layer (Managed by Lovable Cloud)

| Area | Implementation | Grade |
|---|---|---|
| **Cloud Provider** | AWS (via managed Postgres infrastructure) | ✔ Solid |
| **Tenant Isolation** | Dedicated PostgreSQL instance + Row-Level Security | ✔ Strong |
| **Encryption at Rest** | AES-256 (AWS EBS disk-level encryption) | ✔ Industry standard |
| **Encryption in Transit** | TLS 1.2+ enforced on all connections | ✔ Baseline |
| **Compliance** | SOC 2 Type II (infrastructure provider) | ✔ Audited |
| **Backups** | Daily automated + Point-in-Time Recovery | ✔ Confirm retention period |
| **Incident Response** | Managed by platform team, SOC 2 controls | ✔ Normal SaaS model |
| **Staff Access** | Logged, restricted, audited per SOC 2 | ✔ Acceptable |

**Infrastructure Grade: Solid mid-to-high SaaS maturity.**

> ⚠️ SOC 2 applies to infrastructure — not your application logic.
> Your vulnerability surface is **configuration, not infrastructure.**

### Application Layer (Managed by XBoom Team)

| Area | Owner | Status |
|---|---|---|
| RLS policy correctness on every table | XBoom | 🔍 Requires audit |
| RBAC enforcement at API layer (not just UI) | XBoom | ✔ Implemented |
| Secrets in environment variables | XBoom | ✔ Implemented |
| Rate limiting on edge functions | XBoom | ⚠️ Partial |
| Audit logging for admin actions | XBoom | ✔ Implemented |
| MFA enforcement for admins | XBoom | ⚠️ Not enforced |
| Input validation (server-side) | XBoom | ✔ Implemented |
| Service role key protection | XBoom | ✔ Edge functions only |

---

## Layer 1: Network Layer

**Goal: Reduce exposure.**

- Application behind HTTPS only (TLS 1.2+).
- If public: Use WAF (Cloudflare / AWS WAF).
- If internal: Restrict via VPN + IP allowlist.
- Disable direct database public access.
- Separate dev, staging, production environments.
- Use separate credentials for each environment.
- Never allow database ports (like 5432, 3306) open to the internet. Ever.

---

## Layer 2: Authentication Layer

**Goal: No anonymous access.**

- SSO (Google Workspace / Azure AD / Okta preferred).
- Enforce MFA.
- Short-lived JWT tokens.
- Secure HttpOnly cookies (if using cookies).
- Automatic session expiry.
- Logout invalidates session server-side.
- Never store tokens in localStorage. That's XSS bait.

---

## Layer 3: Authorization Layer (Critical)

**Goal: Even if logged in, user can't see everything.**

Implement strict RBAC:

**Roles (7-role model):**
- Admin (max 5)
- HR
- Finance
- Supply Chain
- IT
- Marketing
- Sales

**Every API must check:**
1. Is user authenticated?
2. Does user have permission for this resource?
3. Is the resource belonging to their organization?
4. Is the user **approved** (`is_user_approved()`)?

**Prevent IDOR:**
User must not access `/api/employee?id=123` just by changing ID to 124. Access must be validated server-side.

**Role Storage:**
- Roles stored in `user_roles` table (NEVER on profiles).
- Checked via `has_role()` security definer function.
- Prevents privilege escalation attacks.

---

## Layer 4: API & Backend Security

- All input validated server-side.
- No raw SQL (use parameterized queries).
- Rate limiting (prevent brute force).
- No stack traces in production.
- Sanitize logs.

**Protect against:**
- XSS
- CSRF
- SQL Injection
- File upload abuse

Follow OWASP Top 10 strictly.

---

## Layer 5: Data Protection

**Sensitive data includes:**
- Employee personal info
- Attendance logs
- Payroll data
- Admin credentials
- Payment risk scores
- Demand forecasts

**Protect with:**
- Encryption at rest (AES-256, AWS EBS)
- Encryption in transit (TLS 1.2+)
- Secret storage in environment variables (Cloud Secrets)
- No secrets in Git repo
- Encrypted backups
- Private storage buckets for invoices, signatures, payment screenshots

---

## Layer 6: Monitoring & Incident Response

**Log:**
- Login attempts
- Role changes
- Admin actions
- Invoice signing (audit trail)
- Attendance corrections (audit trail)
- User activity sessions

**Alert on suspicious patterns.**

- Backup daily + PITR
- Recovery plan documented

> Security is not preventing breach. Security is minimizing damage.

---

## Live Security Audit Findings (Auto-Generated)

> Last scanned: 2026-02-23

### 🔴 ERRORS (4)

| # | Issue | Risk |
|---|---|---|
| 1 | **4x Security Definer Views** | Views bypass RLS of querying user — data may leak across roles |
| 2 | **Forms table publicly readable** | Exposes form metadata, creator names to unauthenticated users |
| 3 | **Demand forecasts exposed** | Any authenticated (even unapproved) user can read inventory predictions |
| 4 | **Payment risk scores exposed** | Customer risk analysis readable by any authenticated user |

### 🟡 WARNINGS (29)

| Category | Count | Description |
|---|---|---|
| **RLS Policy Always True** | 26 | Policies using `USING (true)` or `WITH CHECK (true)` on INSERT/UPDATE/DELETE |
| **Function Search Path Mutable** | 2 | Functions without explicit `search_path` — potential schema poisoning |
| **Extension in Public** | 1 | `pg_trgm` installed in public schema |
| **Unapproved user access** | 3 | `demand_forecasts`, `payment_risk_scores`, `forecast_accuracy_log` lack `is_user_approved()` check |
| **Lead tags public** | 1 | Sales classification system readable publicly |
| **Form fields public** | 1 | All form field configurations exposed |

### Priority Fix Order

1. **Harden demand_forecasts & payment_risk_scores** — restrict to admin/finance/supply_chain + add `is_user_approved()` check
2. **Fix Security Definer Views** — convert to SECURITY INVOKER or add explicit RLS
3. **Audit all 26 `USING (true)` policies** — determine which are intentional vs misconfigured
4. **Restrict forms/form_fields** public access — only expose fields for active public forms
5. **Set `search_path`** on remaining functions
6. **Move `pg_trgm`** extension out of public schema

---

## Security Checklist (Supabase + RLS Projects)

- [ ] Every table has RLS enabled
- [ ] No `USING (true)` on INSERT/UPDATE/DELETE without justification
- [ ] All policies use `is_user_approved()` for approved-user check
- [ ] Roles checked via `has_role()` security definer (not direct table query)
- [ ] Service role key NEVER exposed to client
- [ ] Edge functions validate JWT before processing
- [ ] Storage buckets are private by default
- [ ] Admin whitelist enforced (max 5 admins)
- [ ] Audit logs exist for sensitive mutations
- [ ] No secrets in codebase or localStorage

---

## Related Documents

- [IDENTITY_AND_ACCESS_MANAGEMENT.md](IDENTITY_AND_ACCESS_MANAGEMENT.md) — RBAC implementation, MFA enforcement, session policy, access control matrix, IDOR prevention, RLS policy standards
- [SHOPIFY_SECURITY.md](../SHOPIFY_SECURITY.md) — Shopify credential management, HMAC verification, health-check endpoint
- [SHOPIFY_WEBHOOK_SETUP.md](../SHOPIFY_WEBHOOK_SETUP.md) — Webhook registration, HMAC testing, database schema

---

*Last updated: 2026-03-06*
