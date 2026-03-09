# Roadmap — oa_td88

_Last updated: 2026-03-09_

## Goal
Turn the existing attendance app into a stable, secure, maintainable, deployable internal product.

---

## Phase 1 — Stabilization (highest priority)

### Objective
Reduce correctness and production risk before adding major new features.

### Deliverables
- Route/API audit completed
- Critical attendance logic fixes merged
- Permission boundary review completed
- Lint/build baseline verified
- Top-risk issues documented and resolved

### Workstreams

#### 1. Attendance integrity
- verify transaction usage in attendance flows
- verify month lock enforcement consistency
- verify shift lookup behavior inside transactional flows
- verify warning/status recalculation logic
- verify off-day quota and deduction rules

#### 2. Auth and permission safety
- review account/profile update boundaries
- review admin-only and superadmin-only endpoints
- review session handling and revocation flows
- review login throttling and abuse controls

#### 3. Data/admin safety
- review DB import/export endpoints
- review backup/restore behavior
- review payroll/monthly closure consistency
- review audit logging around sensitive actions

#### 4. Engineering baseline
- run lint
- run build
- identify broken flows and obvious refactor blockers

### Exit criteria
- no known P0 issues remain open
- build/lint pass or have documented blockers
- reviewer signs off on Phase 1 summary

---

## Phase 2 — Hardening

### Objective
Make the app safer and more maintainable for real internal usage.

### Deliverables
- stronger validation consistency
- improved shared helpers/utilities
- clearer admin safety rails
- reduced query inefficiencies in hot paths

### Workstreams
- unify duplicated helper logic
- improve dashboard/overtime/import efficiency
- tighten import/export and destructive-action UX
- improve audit coverage and error handling

### Exit criteria
- key hot paths reviewed
- major duplication and unsafe patterns reduced
- admin operations are clearer and safer

---

## Phase 3 — UX polish

### Objective
Improve usability for admins and employees.

### Deliverables
- clearer loading/error/success feedback
- improved admin workflow UX
- more consistent UI behavior
- responsive review of key screens

### Workstreams
- dashboard clarity
- better form feedback
- better import/export operator experience
- search/filter/sort improvements where missing
- consistency pass across admin pages

### Exit criteria
- key pages feel coherent and easier to operate
- major friction points documented and reduced

---

## Phase 4 — Release readiness

### Objective
Prepare the project for smoother deployment and maintenance.

### Deliverables
- deployment checklist
- environment/config checklist
- backup/recovery procedure
- production sanity checklist

### Workstreams
- deployment docs review
- env variable review
- DB safety/runbook
- release checklist for admin/security validation

### Exit criteria
- project can be deployed and operated with lower risk
- recovery/backup guidance exists

---

## Suggested order of execution
1. Backend/domain stabilization
2. Reviewer validates risks
3. Frontend polish for affected workflows
4. Release readiness wrap-up
