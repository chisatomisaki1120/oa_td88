# Task Board — oa_td88

_Last updated: 2026-03-09_

## Now

### T1. Backend/API audit
**Owner:** Backend Agent  
**Priority:** P0

Audit all high-risk route handlers:
- `app/api/attendance/**`
- `app/api/auth/**`
- `app/api/account/**`
- `app/api/admin/**`
- `app/api/superadmin/**`

**Definition of done:**
- issues grouped by severity
- concrete fix list proposed
- top 3-7 actionable changes identified

---

### T2. Build/lint baseline
**Owner:** Lead or Reviewer  
**Priority:** P0

Run and summarize:
- install dependencies if needed
- `npm run lint`
- `npm run build`

**Definition of done:**
- pass/fail recorded
- blockers captured clearly

---

### T3. Security/permission review
**Owner:** Reviewer Agent  
**Priority:** P0

Review:
- RBAC boundaries
- self-service profile edits
- admin-only and superadmin-only operations
- import/export/backup/restore exposure
- session/admin tools exposure

**Definition of done:**
- risks categorized
- highest-risk endpoints listed
- fix recommendations provided

---

## Next

### T4. Attendance correctness fixes
**Owner:** Backend Agent  
**Priority:** P0

Target categories:
- transaction boundaries
- warning/status recalculation
- shift lookup consistency
- month lock enforcement
- off-day logic consistency

---

### T5. Query efficiency pass
**Owner:** Backend Agent  
**Priority:** P1

Target categories:
- dashboard aggregation
- overtime logic
- imports with repeated queries
- shared utility cleanup

---

### T6. Admin UX polish
**Owner:** Frontend Agent  
**Priority:** P1

Target categories:
- loading/error/success states
- import/export flow feedback
- admin page consistency
- responsive gaps

---

## Later

### T7. Release readiness docs
**Owner:** Lead + Reviewer  
**Priority:** P2

Deliverables:
- deployment checklist
- backup/restore runbook
- production validation checklist

---

## Working rules
- No large feature expansion before Phase 1 stabilization
- One agent owns each task
- Reviewer checks all P0 changes
- Lead decides final priority and acceptance
