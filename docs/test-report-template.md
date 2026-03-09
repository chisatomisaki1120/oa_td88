# Test Report Template — oa_td88

_Last updated: 2026-03-09_

Dùng file này để ghi kết quả test theo từng vòng kiểm thử.

---

## 1. Thông tin chung

- **Test round:**
- **Tester:**
- **Date:**
- **Environment:** local / staging / production-like
- **Build/commit:**
- **Database snapshot used:**
- **Notes:**

---

## 2. Tổng quan kết quả

- **Passed:**
- **Failed:**
- **Blocked:**
- **Not run:**

### Đánh giá nhanh
- **Overall verdict:** Pass / Fail / Needs follow-up
- **Release recommendation:** Safe / Caution / Do not release yet

---

## 3. Test cases đã chạy

> Tham chiếu ID từ `docs/manual-test-checklist.md`

| Test ID | Tên test | Result | Severity if fail | Notes |
|---|---|---|---|---|
| T3 | Admin không được dùng DB import JSON | Pass | Critical | |
| T4 | Admin không được restore DB | Pass | Critical | |
| T22 | Check-in bình thường | Pass | High | |

---

## 4. Lỗi / phát hiện đáng chú ý

### Finding 1
- **Type:** Bug / UX issue / Security issue / Regression / Data issue
- **Severity:** Critical / High / Medium / Low
- **Related test:**
- **Summary:**
- **Observed behavior:**
- **Expected behavior:**
- **Repro steps:**
- **Workaround:**
- **Attachments:** screenshot / request / response / log

### Finding 2
- **Type:**
- **Severity:**
- **Related test:**
- **Summary:**
- **Observed behavior:**
- **Expected behavior:**
- **Repro steps:**
- **Workaround:**
- **Attachments:**

---

## 5. Regression focus summary

### Security / RBAC
- Status:
- Notes:

### Attendance lifecycle
- Status:
- Notes:

### Stuck shift flow
- Status:
- Notes:

### Overnight shifts
- Status:
- Notes:

### Build / lint
- Status:
- Notes:

---

## 6. Sign-off

- **Tester sign-off:**
- **Reviewer sign-off:**
- **Tech lead decision:**
