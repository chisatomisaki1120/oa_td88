# Project Audit — oa_td88

_Last updated: 2026-03-09_

## 1. Project snapshot

`oa_td88` is a Next.js internal attendance system with role-based access for `SUPER_ADMIN`, `ADMIN`, and `EMPLOYEE`.

### Current stack
- Next.js 16 + React 19 + TypeScript
- Prisma 7 + SQLite
- App Router + route handlers
- Cookie/session auth + CSRF + login rate limiting
- Excel import/export and DB import/export utilities

### Current product scope
- Username/password login
- Employee attendance actions: check-in, check-out, breaks, off-day
- Employee history and account profile
- Admin attendance, payroll, shifts, users, sessions, settings
- Super admin monthly closure reopen

## 2. Overall assessment

This repo is **past MVP scaffolding** and already contains substantial domain logic. The main need is not “add lots of new features” but:

1. Stabilize correctness
2. Tighten security and permissions
3. Reduce operational risk
4. Polish UX and release readiness

## 3. Strengths

- Clear domain focus and useful real-world feature set
- Reasonable project structure (`app/`, `components/`, `lib/`, `prisma/`)
- RBAC already exists
- Audit log/session/security concepts already present
- Admin tooling for import/export and DB operations already exists
- Prisma schema is rich enough to support production hardening

## 4. Main risks

### A. Business logic correctness
Attendance and payroll systems fail badly if small logic errors slip through.

Risk areas:
- transaction boundaries
- month lock enforcement
- warning/status recalculation consistency
- shift lookup correctness
- off-day quotas and deduction behavior

### B. Security and privilege boundaries
This app contains admin-only and superadmin-only capabilities, including DB import/export and monthly closure operations.

Risk areas:
- profile update permissions
- admin endpoints missing validation
- data import/export safety
- auth/session edge cases

### C. Operational reliability
SQLite is fine for an internal app, but import/export, backups, and concurrent write behavior need careful handling.

Risk areas:
- blocking DB operations
- backup/restore safety
- build/runtime consistency
- upgrade scripts and schema drift

### D. UX completeness
The app appears functional, but admin workflows likely still need polish.

Risk areas:
- empty/loading/error states
- import/export feedback
- filtering/searching
- responsive admin views

## 5. Priority findings

## P0 — fix first
These are the issues that should be addressed before major expansion.

1. Attendance flow correctness and transaction integrity
2. Missing or inconsistent endpoint protection/rate limiting
3. Permission boundary review on profile/admin actions
4. Import/export and DB admin action safety
5. Build/lint/stability baseline for the current codebase

## P1 — fix next
1. Query efficiency on dashboard/overtime/import flows
2. Better admin UX feedback and resilience
3. Stronger release/deploy documentation
4. More consistent validation and shared helpers

## P2 — polish later
1. UI consistency improvements
2. Better observability/logging ergonomics
3. Optional automated tests for key flows

## 6. Confirmed observations from repo review

### Confirmed in current codebase
- `attendance/off-day` currently performs month-unlocked check inside a transaction
- `attendance/off-days` currently has API rate limiting
- `attendance/breaks/end` currently has API rate limiting
- `account/profile` already restricts work schedule field updates to admin/superadmin users

That means some earlier improvement notes have **already been implemented**. Good sign.

## 7. Recommended AI team structure

### Lead / Architect
Owns prioritization, sequencing, consistency, and acceptance decisions.

### Backend / Domain Agent
Owns API correctness, Prisma integrity, auth/session/security, and attendance rules.

### Frontend / UX Agent
Owns admin and employee UI polish, loading/error/empty states, and workflow clarity.

### Reviewer / QA Agent
Owns critical review, edge-case checks, regression spotting, and release confidence.

## 8. Recommended delivery strategy

### Phase 1 — Stabilization
- audit route handlers and business logic
- fix correctness/security issues
- ensure lint/build sanity

### Phase 2 — Hardening
- improve validation, logging, admin safety, and import/export robustness

### Phase 3 — UX polish
- improve dashboard/admin usability and operator feedback

### Phase 4 — Release readiness
- deployment checklist, environment clarity, backups, and production sanity checks

## 9. Success criteria

This project is “team-ready” when:
- `npm run lint` passes
- `npm run build` passes
- core attendance flows work reliably
- role boundaries are respected
- monthly closure behavior is safe
- import/export and backup actions are clearly guarded
- reviewer signs off on major changes
