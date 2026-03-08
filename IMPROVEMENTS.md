# Phân tích luồng xử lý & Các điểm cải thiện

> Phân tích ngày: 2026-03-08

---

## 1. BUG THỰC TẾ CẦN SỬA

### 1.1. `assertMonthUnlocked` nằm ngoài transaction (Race condition)

**File:** `app/api/attendance/off-day/route.ts` (dòng 22)

```typescript
// Check ngoài transaction — tháng có thể bị lock giữa check và update
const workDate = vnDateString();
if (!(await assertMonthUnlocked(workDate))) return fail(...);
// ... sau đó mới vào $transaction
```

Ở check-in/check-out thì `assertMonthUnlocked` nằm **trong** transaction (đúng). Nhưng ở off-day đơn lẻ, nó nằm **ngoài** → race condition nếu admin lock tháng cùng lúc.

**Cách sửa:** Di chuyển `assertMonthUnlocked` vào bên trong `$transaction`.

---

### 1.2. Thiếu rate limiting ở một số endpoint

| Endpoint | Có rate limit? |
|----------|---------------|
| `attendance/check-in` | ✅ Có |
| `attendance/check-out` | ✅ Có |
| `attendance/breaks/start` | ✅ Có |
| `attendance/breaks/end` | ❌ **THIẾU** |
| `attendance/off-day` | ❌ **THIẾU** |
| `attendance/off-days` | ❌ **THIẾU** (bulk endpoint) |

**Cách sửa:** Thêm `consumeApiRateLimit` vào 3 endpoint thiếu.

---

### 1.3. In-memory rate limit store bị memory leak

**File:** `lib/rate-limit.ts` (dòng 4)

```typescript
const apiRateLimitStore = new Map<string, { count: number; resetAt: number }>();
```

Map này **không bao giờ được cleanup**. Mỗi key (`checkin:userId`, `checkout:userId`...) tồn tại mãi mãi. Với nhiều user, memory sẽ tăng dần.

**Cách sửa:** Thêm cleanup cũ khi `now >= entry.resetAt` (ví dụ: periodic sweep hoặc lazy cleanup khi access).

---

### 1.4. `getActiveShiftForUser` query ngoài transaction

**File:** `app/api/attendance/check-in/route.ts` (dòng 25), tương tự ở check-out và breaks/end.

```typescript
const result = await prisma.$transaction(async (tx) => {
  //...
  const shift = await getActiveShiftForUser(user.id, now);
  // ← dùng `prisma` global, KHÔNG dùng `tx`
});
```

Hàm `getActiveShiftForUser` trong `lib/attendance.ts` dùng `prisma` global (không phải `tx`), nên không nằm trong transaction.

**Cách sửa:** Thêm param `tx?: Prisma.TransactionClient` vào `getActiveShiftForUser` và truyền `tx` khi gọi trong transaction.

---

## 2. VẤN ĐỀ HIỆU NĂNG

### 2.1. Dashboard API — O(n) lặp lại nhiều lần + query tuần tự

**File:** `app/api/admin/dashboard/route.ts`

- 5 lần `filter()` trên cùng `todayAttendance` (dòng 19-21). Nên duyệt 1 lần và phân loại.
- Nhiều query tuần tự có thể chạy song song với `Promise.all()`:
  ```typescript
  // Hiện tại: tuần tự
  const totalEmployees = await prisma.user.count(...);
  const todayAttendance = await prisma.attendanceDay.findMany(...);
  // → Nên: Promise.all([...])
  ```
- `notIn: [...checkedInUserIds]` — convert Set → Array không cần thiết, với nhiều user → query WHERE NOT IN chậm trên SQLite.

**Cách sửa:** Batch queries bằng `Promise.all`, duyệt 1 vòng lặp để phân loại status.

---

### 2.2. Overtime API — `users.find()` trong vòng lặp

**File:** `app/api/admin/overtime/route.ts` (dòng 32)

```typescript
for (const a of attendance) {
  const u = users.find((u) => u.id === a.userId); // ← O(n) mỗi record
}
```

Với 100 users × 30 ngày = 3000 lần `.find()`.

**Cách sửa:** Tạo `const userMap = new Map(users.map(u => [u.id, u]))` trước vòng lặp.

---

### 2.3. Attendance import — N+1 query cho month closure

**File:** `app/api/admin/attendance/import/route.ts` (dòng 64)

```typescript
for (let i = 0; i < rawRows.length; i++) {
  // Mỗi dòng query monthlyClosure riêng biệt!
  const closure = await prisma.monthlyClosure.findUnique({ where: { month } });
}
```

Với 5000 dòng → có thể lên đến 5000 queries.

**Cách sửa:** Batch-load tất cả tháng cần thiết trước vòng lặp (giống `off-days` bulk đã làm đúng):
```typescript
const allMonths = [...new Set(rows.map(r => r.workDate.slice(0, 7)))];
const closures = await prisma.monthlyClosure.findMany({ where: { month: { in: allMonths } } });
const lockedMonths = new Set(closures.filter(c => !c.reopenedAt).map(c => c.month));
```

---

### 2.4. `parseHHMM` bị duplicate 3 lần

Hàm `parseHHMM` được định nghĩa riêng trong:
- `lib/time.ts` (export sẵn)
- `app/api/admin/payroll/route.ts` (dòng 10)
- `app/api/admin/overtime/route.ts` (dòng 8)

**Cách sửa:** Import `parseHHMM` từ `lib/time.ts`, xóa bản duplicate.

---

## 3. VẤN ĐỀ LOGIC NGHIỆP VỤ

### 3.1. Employee tự chỉnh workStartTime / graceMinutes

**File:** `app/api/account/profile/route.ts` (dòng 77-79)

Employee có thể tự sửa `workStartTime`, `workEndTime`, `lateGraceMinutes`, `earlyLeaveGraceMinutes`, `workMode` thông qua profile API. Điều này cho phép nhân viên **tự nới lỏng quy tắc đi muộn/về sớm** của mình.

**Cách sửa:** Chỉ cho ADMIN/SUPER_ADMIN sửa các trường liên quan đến thời gian làm việc. Employee chỉ được sửa: `fullName`, `email`, `phone`, `address`, `password`.

---

### 3.2. Shift assignment không validate FK và trùng lặp

**File:** `app/api/admin/shift-assignments/route.ts`

- Không kiểm tra `userId` tồn tại trong DB
- Không kiểm tra `shiftId` tồn tại trong DB
- Không kiểm tra trùng lặp assignment (cùng user, cùng khoảng thời gian chồng chéo)
- Generic `.catch(() => null)` ẩn lỗi thực tế (line 21)

**Cách sửa:**
```typescript
const [userExists, shiftExists] = await Promise.all([
  prisma.user.findUnique({ where: { id: payload.data.userId }, select: { id: true } }),
  prisma.shift.findUnique({ where: { id: payload.data.shiftId }, select: { id: true } }),
]);
if (!userExists) return fail("Nhân viên không tồn tại", 404);
if (!shiftExists) return fail("Ca làm việc không tồn tại", 404);
```

---

### 3.3. Check-in set warning "LATE" nhưng bị ghi đè khi check-out

**File:** `app/api/attendance/check-in/route.ts` (dòng 34)

```typescript
warningFlagsJson: status === AttendanceStatus.LATE ? JSON.stringify(["LATE"]) : "[]"
```

Nhưng `WARNING_FLAGS` trong `lib/constants.ts` không có `"LATE"`. Khi check-out, `recalculateAttendanceDay` tính lại toàn bộ warnings từ `calculateWarnings()` — hàm này chỉ check break policy, không check trạng thái LATE. Kết quả: trạng thái `status=LATE` vẫn đúng, nhưng `warningFlagsJson` không còn phản ánh LATE sau check-out.

**Cách sửa:** Thêm logic check LATE vào `calculateWarnings()` hoặc `recalculateAttendanceDay()`, hoặc thêm `"LATE"` vào `WARNING_FLAGS` và merge warnings khi recalculate.

---

### 3.4. Monthly closure/reopen không lồng trong transaction

**File:** `app/api/admin/monthly-closure/close/route.ts` (dòng 15-29)

`upsert` + `auditLog.create` là 2 operations riêng biệt. Nếu audit log fail, tháng đã bị lock mà không có log.

**Cách sửa:** Wrap 2 operations trong `prisma.$transaction()`.

---

## 4. VẤN ĐỀ BẢO MẬT

### 4.1. DB import chạy `execSync` — block event loop

**File:** `app/api/admin/db/import.json/route.ts` (dòng 91)

```typescript
execSync("npx prisma db push --accept-data-loss --config prisma.config.ts", {
  cwd: process.cwd(),
  stdio: "pipe",
});
```

Command hardcoded nên không có injection risk, nhưng `execSync` **block event loop** toàn bộ server. Và `--accept-data-loss` có thể gây mất data nếu schema khác.

**Cách sửa:** Dùng `execFile` (async) thay vì `execSync`. Cân nhắc bỏ `--accept-data-loss` hoặc cảnh báo rõ cho user.

---

### 4.2. DB export leak absolute database path

**File:** `app/api/admin/db/export.json/route.ts` (dòng 47)

```typescript
meta: {
  databasePath: dbPath, // ← Leak: C:\Users\duyho\...\prisma\dev.db
}
```

**Cách sửa:** Bỏ field `databasePath` hoặc chỉ hiện tên file: `path.basename(dbPath)`.

---

### 4.3. CSP cho phép `unsafe-inline` và `unsafe-eval`

**File:** `next.config.ts` (dòng 17)

```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

`unsafe-eval` mở cửa cho XSS attacks. Next.js yêu cầu `unsafe-inline` cho inline scripts, nhưng `unsafe-eval` không bắt buộc.

**Cách sửa:** Bỏ `unsafe-eval` nếu app hoạt động bình thường. Hoặc dùng nonce-based CSP.

---

### 4.4. Admin session revoke không kiểm tra quyền role

**File:** `app/api/admin/sessions/route.ts` (dòng 37)

ADMIN có thể xóa bất kỳ session nào, kể cả session của SUPER_ADMIN, làm SUPER_ADMIN bị logout.

**Cách sửa:**
```typescript
const session = await prisma.authSession.findUnique({
  where: { id: sessionId },
  include: { user: { select: { role: true } } },
});
if (session?.user.role === Role.SUPER_ADMIN && user.role !== Role.SUPER_ADMIN) {
  return fail("Admin không được thu hồi phiên của SuperAdmin", 403);
}
```

---

## 5. VẤN ĐỀ CẤU TRÚC CODE

### 5.1. Error handling pattern thiếu nhất quán

| Endpoint | Pattern |
|----------|---------|
| `check-in` | `null` cho ALREADY_CHECKED_IN, string cho lỗi khác |
| `check-out` | string cho tất cả |
| `breaks/start` | generic `return e.message` (unsafe — trả lỗi hệ thống) |
| `breaks/end` | explicit type cast |

**Cách sửa:** Tạo custom error class `BusinessError`:
```typescript
class BusinessError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}
// Sử dụng:
throw new BusinessError("MONTH_LOCKED");
// Catch:
.catch((e) => {
  if (e instanceof BusinessError) return e.code;
  throw e; // re-throw lỗi hệ thống
});
```

---

### 5.2. `parseWarnings` bị duplicate 4 lần

Hàm copy-paste tại:
- `lib/attendance.ts` (export sẵn)
- `app/api/admin/dashboard/route.ts`
- `app/api/admin/payroll/route.ts`
- `app/api/admin/attendance/export.xlsx/route.ts`

**Cách sửa:** Import `parseWarnings` từ `lib/attendance.ts`.

---

### 5.3. Shift thiếu endpoint cập nhật/xóa

`app/api/admin/shifts/route.ts` chỉ có GET + POST, không có PATCH/DELETE. Admin không thể sửa/xóa ca làm việc sai.

**Cách sửa:** Thêm PATCH và DELETE endpoints (hoặc ít nhất soft-delete bằng `isActive: false`).

---

### 5.4. Không có middleware/wrapper chung cho auth/CSRF/rate-limit

Mỗi API route tự kiểm tra auth/CSRF/rate-limit riêng → dễ bỏ sót (như `breaks/end` thiếu rate limit).

**Cách sửa:** Tạo wrapper functions:
```typescript
// lib/api-middleware.ts
export function withEmployee(handler: Handler) {
  return async (request: NextRequest) => {
    if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
    const user = await getSessionUserFromRequest(request);
    if (!user) return fail("Unauthorized", 401);
    const rl = consumeApiRateLimit(`${request.url}:${user.id}`);
    if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);
    return handler(request, user);
  };
}
```

---

## 6. TỔNG HỢP ƯU TIÊN

| Mức | Vấn đề | File chính |
|-----|--------|------------|
| **P0** | Employee tự sửa workStartTime/graceMinutes | `app/api/account/profile/route.ts` |
| **P0** | `assertMonthUnlocked` ngoài transaction | `app/api/attendance/off-day/route.ts` |
| **P0** | `getActiveShiftForUser` ngoài transaction | `lib/attendance.ts`, check-in, check-out, breaks/end |
| **P1** | Admin revoke session SUPER_ADMIN | `app/api/admin/sessions/route.ts` |
| **P1** | DB export leak absolute path | `app/api/admin/db/export.json/route.ts` |
| **P1** | CSP `unsafe-eval` | `next.config.ts` |
| **P1** | N+1 queries trong attendance import | `app/api/admin/attendance/import/route.ts` |
| **P1** | Dashboard queries tuần tự + filter lặp | `app/api/admin/dashboard/route.ts` |
| **P2** | Thiếu rate limit ở 3 endpoints | breaks/end, off-day, off-days |
| **P2** | In-memory rate limit store leak | `lib/rate-limit.ts` |
| **P2** | Duplicate `parseWarnings` (4 lần), `parseHHMM` (3 lần) | 7 files |
| **P2** | Error handling pattern không nhất quán | tất cả attendance routes |
| **P2** | Warning "LATE" bị ghi đè khi check-out | check-in + `recalculateAttendanceDay` |
| **P2** | Monthly closure/reopen thiếu transaction | monthly-closure routes |
| **P3** | Shift thiếu PATCH/DELETE | `app/api/admin/shifts/route.ts` |
| **P3** | Shift assignment không validate FK | `app/api/admin/shift-assignments/route.ts` |
| **P3** | Thiếu middleware wrapper chung | tất cả API routes |
| **P3** | `execSync` block event loop | `app/api/admin/db/import.json/route.ts` |
