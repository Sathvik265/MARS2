# Restaurant Billing System Security and Logic Audit

Date: 2026-03-19
Scope reviewed: `rbs/restaurant-billing-app` frontend, backend, and runtime config
Context considered: live restaurant usage, approximately 500-700 DB-backed requests/day, localhost-only execution on the end user's system

## Executive Summary

The most serious weakness in this codebase is the absence of real server-side authentication and authorization. Even in a localhost-only deployment, this still matters on a shared cashier/admin machine because the app trusts the browser and local user state too much. Any local user, browser console action, or local script that can reach the backend can read sensitive billing data, change settings, create or modify orders, reopen/close shifts, alter menu pricing, and purge bills without the backend verifying identity or role.

The second major risk is billing integrity: the frontend calculates prices, taxes, and totals, and the backend largely trusts those values. That means a malicious client, a browser console edit, or even a frontend bug can generate incorrect bills and incorrect tax values.

There are also operational logic flaws around authoritative bill finalization, provisional bill matching, and shift/session history that can cause duplicate numbers, wrong bill linkage, and poor auditability under real usage.

## Findings

### 1. [HIGH] Plaintext database credential committed to the repository

Evidence:
- [backend/.env](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/.env#L1) through [backend/.env](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/.env#L5)
- [backend/src/db/index.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/db/index.js#L5) through [backend/src/db/index.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/db/index.js#L12)

Why this matters:
- The DB password is stored in plaintext in version-controlled code.
- Anyone with repo access can connect to the production-like database if network access exists.
- Even if this is "only local", once a secret lands in Git history it should be treated as exposed.

Recommended fix:
- Rotate the PostgreSQL password immediately.
- Remove real `.env` files from version control.
- Add `.env` to `.gitignore`.
- Replace committed secrets with `.env.example`.
- For production, use OS-level secrets, container secrets, or a secret manager.

Implementation complexity: Low

Notes:
- This is one of the fastest issues to fix, but it requires credential rotation, not just deleting the file.

### 2. [HIGH] No real server-side authentication or authorization protects sensitive routes

Evidence:
- [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L58) through [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L70)
- [backend/src/routes/billingRoutes.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/routes/billingRoutes.js#L6) through [backend/src/routes/billingRoutes.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/routes/billingRoutes.js#L37)
- [backend/src/routes/shiftRoutes.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/routes/shiftRoutes.js#L10) through [backend/src/routes/shiftRoutes.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/routes/shiftRoutes.js#L20)
- [backend/src/controllers/reportController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/reportController.js#L453) through [backend/src/controllers/reportController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/reportController.js#L456)

Why this matters:
- The backend exposes billing, orders, reports, settings, shifts, reconciliation, and menu mutations with no auth middleware.
- A caller does not need to be logged in to hit admin-grade routes.
- This is the single largest control failure in the system.

Real impact:
- Anyone on the same network or device could:
- Read all bills and pending orders.
- Change tax settings or receipt details.
- Add, edit, or delete menu items.
- Reopen or close shifts.
- Purge bills for date ranges.

Recommended fix:
- Introduce backend-enforced authentication.
- Introduce role-based authorization checks for clerk vs admin.
- Protect all write endpoints and all sensitive read endpoints.
- Add an auth middleware layer before route handlers.
- Use server-issued sessions or signed JWTs with short expiry.

Implementation complexity: Medium to High

Notes:
- This is architectural, but it should be the first remediation priority for a live deployment.

### 3. [HIGH] Admin authentication is implemented client-side with hardcoded passwords and UI role state

Evidence:
- [frontend/src/components/LoginPanel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/LoginPanel.js#L135) through [frontend/src/components/LoginPanel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/LoginPanel.js#L151)
- [frontend/src/App.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/App.js#L35) through [frontend/src/App.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/App.js#L39)
- [frontend/src/App.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/App.js#L167) through [frontend/src/App.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/App.js#L180)
- [frontend/src/context/UserContext.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/context/UserContext.js#L17) through [frontend/src/context/UserContext.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/context/UserContext.js#L20)
- [frontend/src/context/UserContext.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/context/UserContext.js#L42) through [frontend/src/context/UserContext.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/context/UserContext.js#L74)

Why this matters:
- The admin passwords are embedded in the frontend bundle.
- The frontend sets admin mode locally without backend verification.
- The app trusts `localStorage` to remember role and user identity.

Real impact:
- Anyone who can open dev tools can discover or bypass the admin flow.
- A user can often self-elevate by changing `localStorage` keys such as `mode`, `userInitials`, `track`, or `sessionId`.
- Because the backend does not validate roles, frontend-only "protection" has no real security value.

Recommended fix:
- Remove hardcoded passwords from the frontend entirely.
- Move all authentication checks to the backend.
- Store password hashes in the database using `bcrypt` or Argon2.
- Return a signed session/token after login.
- Use backend role checks for admin-only actions.

Implementation complexity: Medium

### 4. [HIGH] Clerk login is not true authentication; clerk existence alone grants access

Evidence:
- [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L74) through [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L115)

Why this matters:
- Clerk login only checks whether `staff_code` exists in the `settings` table.
- There is no password, no PIN, no device binding, and no signed session.
- Any person who knows or guesses a valid clerk code can log in as that clerk.

Recommended fix:
- Add per-user authentication credentials or staff PINs.
- Store credentials separately from receipt settings.
- Log authentication events with identity, device, and timestamp.

Implementation complexity: Medium

### 5. [HIGH] Billing totals and tax values are calculated on the client and trusted by the server

Evidence:
- [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L436) through [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L452)
- [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L464) through [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L478)
- [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L180) through [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L190)
- [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L119) through [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L166)

Why this matters:
- The browser computes `subtotal`, `sgst`, `cgst`, `tax_amount`, and `grand_total`.
- The backend writes those values directly into the final bill.
- A modified client or intercepted request can undercharge or overcharge a bill.

Real impact:
- Financial leakage.
- Tax reporting inaccuracies.
- Difficulty proving bill correctness during disputes or audits.

Recommended fix:
- Recompute all totals on the server from persisted order lines and current tax settings.
- Ignore client-supplied monetary totals except for optional display hints.
- Record server-side calculation inputs and results.

Implementation complexity: Medium

### 6. [HIGH] Order pricing is also trusted from the client, allowing price tampering

Evidence:
- [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L276) through [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L340)
- [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L350) through [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L366)
- [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L707)
- [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L708)
- [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L719)
- [frontend/src/components/BillingScreen.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/BillingScreen.js#L720)

Why this matters:
- Order creation accepts `unit_price` and `line_total` from the caller.
- Order updates recalculate `line_total` using a client-supplied `unit_price`.
- The server does not appear to look up the authoritative menu price during order write operations.

Recommended fix:
- On create/update, resolve item pricing server-side from the item table and billing section.
- Allow manual price overrides only through an explicit admin-only override flow with audit logging.
- Reject negative or implausible values.

Implementation complexity: Medium

### 7. [HIGH] Final authoritative bill number generation is race-prone under concurrent billing

Evidence:
- [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L42) through [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L55)
- [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L128) through [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L167)

Why this matters:
- A client-side running/display number is acceptable for UI preview if that is a business requirement.
- The problem is that the final persisted bill number is still generated with `MAX(bill_number) + 1` in a race-prone way.
- `finalizeBill()` starts a transaction, but `getNextBillNumber()` uses the shared pool, not the same transaction.
- Two requests can read the same `MAX(bill_number)` and attempt to assign the same next number.
- At 500-700 requests/day this may appear rarely, but peak windows like lunch/dinner are exactly where race conditions show up.

Recommended fix:
- Keep the client-side running number only as a display hint if needed.
- Generate the final saved bill number atomically on the server.
- Use a DB sequence, or a dedicated per-day counter row locked with `SELECT ... FOR UPDATE`.
- Generate the bill number inside the same transaction/connection used for finalization.
- Add a uniqueness constraint and retry logic.

Implementation complexity: Medium

### 8. [HIGH] Purge endpoint can delete all bills in a date range without backend authorization

Evidence:
- [backend/src/routes/billingRoutes.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/routes/billingRoutes.js#L14) through [backend/src/routes/billingRoutes.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/routes/billingRoutes.js#L18)
- [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L418) through [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L450)
- [frontend/src/components/AdminPanel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/AdminPanel.js#L664) through [frontend/src/components/AdminPanel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/components/AdminPanel.js#L695)

Why this matters:
- This is a destructive function with no backend auth check, no approval workflow, no audit trail, and no backup enforcement.
- A browser request or script can wipe billing history.

Recommended fix:
- Restrict this route to authenticated super-admins only.
- Add audit logging with user, time, and date range.
- Require second-factor confirmation or typed confirmation phrase.
- Prefer soft delete or archival over permanent delete in production.

Implementation complexity: Medium

### 9. [MEDIUM] Provisional bill selection can attach the wrong bill or wrong orders

Evidence:
- [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L110) through [backend/src/controllers/billingController.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/controllers/billingController.js#L145)
- [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L57) through [backend/src/models/billingModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/billingModel.js#L70)

Why this matters:
- The code looks up the provisional bill for finalization using only `table_no` and `party_no`, ordered by latest `created_at`.
- It then reassigns all matching orders for that table/party during recovery.
- If the same table/party is reused across shifts, clerks, or concurrent recovery states, the wrong provisional bill can be finalized.

Recommended fix:
- Issue and persist a dedicated provisional bill ID when the first order is created.
- Carry that ID through all subsequent order and finalize requests.
- Enforce a unique active-bill constraint that includes the real business key, such as table, party, shift, and session.

Implementation complexity: Medium

### 10. [MEDIUM] Shift/session logic is date-agnostic and weak for audit/history correctness

Evidence:
- [backend/src/models/shiftModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/shiftModel.js#L48) through [backend/src/models/shiftModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/shiftModel.js#L91)
- [backend/src/models/shiftModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/shiftModel.js#L122) through [backend/src/models/shiftModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/shiftModel.js#L129)
- [backend/src/models/shiftModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/shiftModel.js#L259) through [backend/src/models/shiftModel.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/models/shiftModel.js#L288)
- [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L117) through [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L140)

Why this matters:
- Sessions are effectively reused by `shift_name`.
- A fixed date (`1970-01-01`) is used in some paths.
- `getSessionsByDate()` ignores its date parameter.
- Login checks open/closed status only by shift name, not by actual business day.

Real impact:
- Historical audit data becomes unreliable.
- Reopen/close decisions can apply to the wrong operational day.
- Reporting and staff accountability become harder to trust.

Recommended fix:
- Model sessions as true per-day shift sessions.
- Make session date part of the unique business key.
- Stop reusing the same row forever.
- Ensure close/reopen and reports are scoped to the actual business date.

Implementation complexity: Medium to High

### 11. [LOW] Sensitive request and response data is over-logged

Evidence:
- [backend/src/app.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/backend/src/app.js#L76)
- [frontend/src/services/api.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/services/api.js#L21) through [frontend/src/services/api.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/services/api.js#L45)
- [frontend/src/context/UserContext.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/context/UserContext.js#L43) through [frontend/src/context/UserContext.js](/d:/D1/Code/Python%20codes/rbs/rbs/restaurant-billing-app/frontend/src/context/UserContext.js#L50)

Why this matters:
- Login bodies and API responses are logged during runtime.
- Shared cashier machines often have accessible dev tools or support logs.
- Sensitive operational data should not be dumped routinely.

Recommended fix:
- Remove verbose request/response logging from production builds.
- Add structured server logging with redaction.
- Never log credentials or full response bodies unless explicitly debugging in a secure environment.

Implementation complexity: Low

## Priority Remediation Plan

### Immediate

1. Rotate the exposed DB password and remove committed secrets.
2. Add backend authentication and role enforcement to all sensitive routes, even for localhost use.
3. Remove hardcoded admin passwords from the frontend.
4. Move price, tax, and grand-total calculations fully to the backend.

### Next

1. Fix final bill numbering with DB-safe sequencing while keeping the client-side running number as a preview only.
2. Redesign provisional bill linkage to use a real provisional bill ID.
3. Rework shift/session modeling to be date-aware and auditable.

### Hardening

1. Remove verbose production logging.
2. Add audit logs for login, settings changes, menu edits, shift close/reopen, and bill purge.
3. Create `.env.example` files and remove real secrets from version control.

## Overall Risk Rating

Overall risk: High

Reason:
- The current system can be manipulated without meaningful backend trust boundaries.
- A live restaurant can suffer direct revenue loss, data loss, and audit/reporting errors from the current design.
