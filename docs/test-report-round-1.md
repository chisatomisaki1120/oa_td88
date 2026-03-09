# Test Report — Round 1 — oa_td88

_Date: 2026-03-09_

## 1. Scope
Vòng này là technical verification ngắn, tập trung vào:
- build/lint baseline
- kiểm tra tĩnh một số security/RBAC boundaries đã sửa
- kiểm tra sự hiện diện của flow ca treo mới trong codebase

Chưa phải full manual execution toàn bộ checklist nghiệp vụ.

---

## 2. Environment
- Environment: local workspace
- Database: default SQLite `file:./prisma/dev.db`
- Build mode: local production build

---

## 3. Summary
- **Passed:** 6
- **Failed:** 0
- **Blocked:** 0
- **Not run:** full manual UI/browser interaction suite

### Overall verdict
**Pass (technical verification round)**

### Release recommendation
**Caution** — baseline kỹ thuật ổn, nhưng vẫn nên chạy manual suite nghiệp vụ trước khi production rollout.

---

## 4. Executed checks

| Test ID | Name | Result | Severity if fail | Notes |
|---|---|---|---|---|
| T2 | Build baseline | Pass | Critical | `npm run lint` pass, `npm run build` pass |
| T3/T4/T5 | Admin bị chặn khỏi DB import/export/restore | Pass (static verification) | Critical | Các route nhạy cảm đã dùng `requireRoleRequest(request, [Role.SUPER_ADMIN])` |
| T7 | Admin không được PATCH security settings | Pass (static verification) | High | PATCH dùng `SUPER_ADMIN` only |
| T30/T31 | Stuck shift chặn employee flow | Pass (static verification) | High | `PREVIOUS_SHIFT_NOT_CHECKED_OUT` có mặt ở các route attendance chính |
| T32/T33 | Admin có flow xử lý ca treo | Pass (static verification) | High | `openOnly` filter và block UI `Ca treo cần xử lý` đã nối xong |
| T48 | Regression build/lint | Pass | Critical | Sau thay đổi mới nhất repo vẫn build được |

---

## 5. Findings

### F1. Build/lint baseline hiện tại ổn
- `npm run lint` pass
- `npm run build` pass
- Không thấy lỗi TypeScript/runtime build blocker ở vòng này

### F2. RBAC siết đúng ở các route nhạy cảm đã vá
Xác minh tĩnh thấy các route sau đã là `SUPER_ADMIN` only:
- `app/api/admin/db/backup/restore/route.ts`
- `app/api/admin/db/export.json/route.ts`
- `app/api/admin/db/import.json/route.ts`
- `app/api/admin/security-settings/route.ts` (PATCH)

### F3. Flow ca treo mới đã hiện diện xuyên suốt backend + UI
Xác minh tĩnh thấy:
- `PREVIOUS_SHIFT_NOT_CHECKED_OUT` được ném từ `lib/attendance.ts`
- các route attendance chính đã bắt và trả lỗi 409 phù hợp
- admin attendance có dùng `openOnly=1`
- UI admin có block xử lý ca treo

### F4. Màn build vẫn in warning env lặp lại
Trong build output vẫn có nhiều dòng:
- `[env] DATABASE_URL not set, using default file:./prisma/dev.db`

Đây không phải blocker, nhưng khá ồn. Có thể tối ưu sau bằng một guard để chỉ warn một lần mỗi process.

---

## 6. Recommended next step
Chạy manual suite thật theo `docs/manual-test-checklist.md`, ưu tiên:
1. T3–T12 (RBAC/security)
2. T22–T29 (attendance lifecycle)
3. T30–T34 (stuck shift flow)
4. T38–T42 (overnight edge cases)

---

## 7. Sign-off
- Tester: Kaisa (technical verification)
- Result: Ready for manual QA round
