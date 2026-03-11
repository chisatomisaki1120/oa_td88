# Detailed Local Changes Report for oa_td88

- Generated at: 2026-03-11 18:31 +07:00
- Directory: `C:\Users\duyho\.openclaw\workspace\oa_td88`
- Current branch: `opc`
- Compared against: remote `master`
- Local status: ahead by **1** commit, behind by **9** commits
- Local-only commit: `9fe7beb` — **Hardening attendance workflows and admin controls**

## Executive summary
This local branch is not just a miscellaneous edit set. It is a focused hardening pass around:

1. **attendance workflow correctness**
2. **monthly closure enforcement**
3. **stuck / unresolved previous shift handling**
4. **tighter RBAC for sensitive admin operations**
5. **safer bulk import behavior**
6. **clearer admin and employee UI behavior**
7. **project documentation / QA scaffolding**

---

## 1. Attendance workflow hardening

### What changed
Several attendance endpoints were updated so that attendance state is recalculated from business logic instead of being edited loosely.

### Files
- `app/api/admin/attendance/[id]/route.ts`
- `app/api/admin/attendance/import/route.ts`
- `app/api/attendance/check-in/route.ts`
- `app/api/attendance/check-out/route.ts`
- `app/api/attendance/breaks/start/route.ts`
- `app/api/attendance/breaks/end/route.ts`
- `lib/attendance.ts`

### Details
- Admin attendance patch no longer accepts direct edits to:
  - `status`
  - `warningFlagsJson`
- Instead, after time changes are saved, the system recalculates the attendance record using attendance logic.
- Attendance import now:
  - writes raw check-in / check-out times
  - then recalculates status and worked minutes using attendance rules
  - runs inside a transaction
- Check-in now sets status using computed check-in logic instead of always forcing `INCOMPLETE`.
- Check-out and break-end now recalculate using a schedule reference derived from the attendance record instead of just `new Date()`.

### Why it matters
This reduces the chance of inconsistent attendance data where timestamps, status, worked minutes, and warnings disagree with each other.

---

## 2. Monthly closure enforcement

### What changed
A reusable month-lock guard was added and then enforced across multiple attendance flows.

### Files
- `lib/attendance.ts`
- `app/api/admin/attendance/[id]/route.ts`
- `app/api/admin/attendance/import/route.ts`
- `app/api/attendance/check-in/route.ts`
- `app/api/attendance/check-out/route.ts`
- `app/api/attendance/breaks/start/route.ts`
- `app/api/attendance/breaks/end/route.ts`

### Details
- Added `assertMonthUnlocked(workDate, tx?)` in `lib/attendance.ts`.
- Admin attendance edits are blocked if the month is locked.
- Attendance import skips rows that belong to locked months.
- Employee attendance actions now reject operations in locked months with `409` responses.

### Why it matters
This protects finalized payroll / attendance periods from accidental modification.

---

## 3. Stuck shift / unresolved previous shift handling

### What changed
A new rule was introduced: if a user still has a previous shift opened and not checked out, the system blocks further attendance actions until that issue is resolved.

### Files
- `lib/attendance.ts`
- `app/api/attendance/check-in/route.ts`
- `app/api/attendance/check-out/route.ts`
- `app/api/attendance/breaks/start/route.ts`
- `app/api/attendance/breaks/end/route.ts`
- `app/api/attendance/me/route.ts`
- `components/admin-attendance.tsx`
- `components/employee-today.tsx`

### Details
- Added `getPendingPreviousOpenAttendance(...)` in `lib/attendance.ts`.
- `getOrCreateCurrentShiftAttendance(...)` now throws `PREVIOUS_SHIFT_NOT_CHECKED_OUT` when an unresolved prior shift exists.
- Employee-facing attendance actions now return clear 409 errors for that case.
- `/api/attendance/me` now returns `pendingPreviousShift` along with attendance items.
- Employee UI shows an alert if the previous shift is still open.
- Admin attendance UI now fetches `openOnly=1` rows and shows a **stuck shift** section for operators to resolve.
- Admin can open a stuck record directly and enter a checkout time.

### Why it matters
This prevents overlapping or broken shift chains and gives both employees and admins a concrete resolution path.

---

## 4. RBAC tightening for sensitive admin operations

### What changed
Several sensitive endpoints were restricted from `ADMIN` to `SUPER_ADMIN` only.

### Files
- `app/api/admin/db/backup/restore/route.ts`
- `app/api/admin/db/export.json/route.ts`
- `app/api/admin/db/import.json/route.ts`
- `app/api/admin/security-settings/route.ts`
- `app/api/admin/sessions/route.ts`
- `app/api/admin/users/import/route.ts`

### Details
- DB restore now requires `SUPER_ADMIN`.
- Raw DB JSON export now requires `SUPER_ADMIN`.
- Raw DB JSON import now requires `SUPER_ADMIN`.
- Security settings PATCH now requires `SUPER_ADMIN`.
- Admin session listing now hides `SUPER_ADMIN` sessions from non-superadmin users.
- User import now blocks non-superadmins from updating existing `SUPER_ADMIN` accounts, not just creating new ones.

### Why it matters
This closes privilege boundary gaps around the highest-risk operations.

---

## 5. Safer import and assignment behavior

### What changed
Bulk import and assignment flows were tightened for integrity and consistency.

### Files
- `app/api/admin/attendance/import/route.ts`
- `app/api/admin/users/import/route.ts`
- `app/api/admin/shift-assignments/route.ts`

### Details
#### Attendance import
- preloads month closures to avoid repeated per-row queries
- skips locked months
- recalculates imported attendance after upsert
- writes audit-related metadata such as `updatedBy` / `createdBy`
- executes the import inside a transaction

#### User import
- simplified import contract by removing several fields from import handling:
  - work mode
  - active status
  - late grace
  - early leave grace
  - allowed off days per month
- now protects `SUPER_ADMIN` records from non-superadmin updates
- user creation / update and shift assignment changes now run in a transaction
- assignment effective times use a shared `now` value for consistency

#### Shift assignment creation
- now validates overlap before creating a new assignment
- rejects overlapping assignments with HTTP 409

### Why it matters
This reduces partial writes, protects privileged accounts, and prevents invalid scheduling state.

---

## 6. Break policy model simplification

### What changed
Break policy logic was simplified from separate `wc` and `smoke` buckets into a combined `wcSmoke` model.

### Files
- `lib/attendance.ts`
- `app/api/admin/shifts/route.ts`
- `components/employee-today.tsx`

### Details
- Break policy type now uses:
  - `wcSmoke`
  - `meal`
- Warning calculation now uses:
  - `WC_SMOKE_COUNT_EXCEEDED`
  - `WC_SMOKE_DURATION_EXCEEDED`
- Shift API schema now expects `wcSmoke` instead of separate `wc` / `smoke` config.
- Employee UI break type options now use `WC_SMOKE` instead of separate `WC` and `SMOKE` choices.

### Why it matters
This makes the break model simpler and more consistent, assuming the product intends WC and smoke to share the same policy bucket.

---

## 7. Admin attendance UI changes

### What changed
The admin attendance screen was reshaped to support operator workflows better.

### File
- `components/admin-attendance.tsx`

### Details
- Added a dedicated **stuck shift** block showing unresolved previous-day open shifts.
- Added warning display using parsed warning flags.
- Switched user filter labels from just username to `Full Name (username)`.
- Removed expandable row details UI and replaced it with a simpler direct inline editing table.
- Added a direct operator flow for resolving stuck shifts.
- The screen now loads both the main attendance list and a focused `openOnly=1` list.

### Why it matters
This reduces operator confusion and makes unresolved attendance issues easier to spot and fix.

---

## 8. Employee attendance UI changes

### What changed
The employee screen was simplified and adjusted to match the new backend rules.

### File
- `components/employee-today.tsx`

### Details
- Added support for `pendingPreviousShift` returned by the API.
- Shows an alert when the user still has a previous unresolved shift.
- Replaced popup-style feedback with inline error / message state plus alerting for blocking issues.
- Break type options now use `WC_SMOKE`, `MEAL`, `OTHER`.
- Start-break button is disabled if a break is already open.
- Removed annual leave request UI from this component.
- Removed the old status banner / warning chip UI.
- Off-day submission now reports locked-month skips explicitly.

### Why it matters
The screen is now more aligned with the stuck-shift protection and simpler backend contract, though it also removes some previous UI features.

---

## 9. Environment handling change

### What changed
Environment validation was relaxed.

### File
- `lib/env.ts`

### Details
- The app now only warns if `DATABASE_URL` is missing.
- It no longer throws in production when `DATABASE_URL` is unset.
- Warning message now explicitly says fallback is `file:./prisma/dev.db`.

### Why it matters
This makes local/dev startup easier, but it also reduces safety if production accidentally runs without an explicit database configuration.

---

## 10. Database artifact handling

### What changed
SQLite database files are now handled differently in source control.

### Files
- `.gitignore`
- `prisma/dev.db` (deleted locally from tracked diff)

### Details
- `.gitignore` now ignores `prisma/*.db`.
- `prisma/dev.db` was removed from the tracked snapshot.
- Older broader ignore lines were replaced by the Prisma-specific DB ignore rule.

### Why it matters
This is a cleanup toward not committing local SQLite database artifacts.

---

## 11. Documentation and AI workflow additions

### What changed
A substantial documentation set was added for planning, auditing, testing, and multi-agent collaboration.

### New files
#### Agent role files
- `agents/backend.md`
- `agents/frontend.md`
- `agents/lead.md`
- `agents/reviewer.md`

These define responsibilities, focus areas, priorities, and output expectations for different AI roles.

#### Project / QA docs
- `docs/project-audit.md`
- `docs/roadmap.md`
- `docs/task-board.md`
- `docs/manual-test-checklist.md`
- `docs/bug-report-template.md`
- `docs/test-report-template.md`
- `docs/test-report-round-1.md`

### Why it matters
This is a major process/documentation addition that supports structured review, testing, release readiness, and multi-role AI collaboration around the repo.

---

## 12. Smaller technical changes

### Files
- `app/api/admin/overtime/route.ts`
- `app/api/auth/login/route.ts`

### Details
- Overtime route now uses a prebuilt `userMap` instead of repeated array scans.
- Login route removes an unused `relatedUserIds` variable in one path.

### Why it matters
These are smaller cleanup / efficiency improvements.

---

## Overall interpretation
The local branch is mainly a **stabilization + hardening branch**. The core themes are:

- make attendance state transitions safer
- block invalid cross-shift behavior
- enforce month locks consistently
- tighten high-risk permissions
- make admin remediation easier
- add QA and project-management documentation

It is not a pure feature branch. It is primarily a **correctness, security, and operations hardening pass**.
