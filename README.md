# OA TD88 - Web chấm công nội bộ

Ứng dụng Next.js (App Router) cho chấm công nhân viên theo ngày với phân quyền `SuperAdmin/Admin/Nhân viên`, lưu dữ liệu SQLite qua Prisma.

## Tính năng chính
- Đăng nhập bằng `username/password` do admin cấp.
- Nhân viên check-in/check-out, bắt đầu/kết thúc nghỉ giữa ca, xem lịch sử cá nhân.
- Admin quản lý user, ca làm, gán ca, xem/sửa công, xuất Excel (.xlsx), chốt tháng.
- SuperAdmin mở khóa tháng đã chốt.
- Session cookie + CSRF + rate limit login + audit log.

## Stack
- Next.js 16 + React 19 + TypeScript
- Prisma 7 + SQLite
- `better-sqlite3` adapter cho Prisma Client

## Cài đặt
```bash
npm install
npm run db:setup
npm run dev
```

Mở `http://localhost:3001`.

## Tài khoản mẫu sau khi seed
- `superadmin` / `123456`
- `admin` / `123456`
- `employee` / `123456`

## Scripts
- `npm run dev`: chạy local dev server (tự dùng DB cũ nếu đã có; chỉ khởi tạo DB khi chưa có)
- `npm run build`: build production
- `npm run lint`: lint code
- `npm run db:generate`: generate Prisma Client
- `npm run db:push`: khởi tạo schema SQLite từ `prisma/schema.prisma` (giữ DB cũ nếu đã tồn tại)
- `npm run db:upgrade:login-security`: nâng cấp DB hiện có cho tính năng bảo mật đăng nhập mới (không mất dữ liệu)
- `npm run db:seed`: seed dữ liệu mẫu
- `npm run db:setup`: reset schema + seed dữ liệu mới từ đầu
- `npm run db:reset`: reset nhanh DB và seed lại

## Cấu trúc thư mục chính
- `app/`: pages + route handlers API
- `components/`: UI cho login/employee/admin/superadmin
- `lib/`: auth, rbac, csrf, rate-limit, business logic chấm công
- `prisma/`: schema và seed
- `scripts/db-push.ts`: script apply schema cho SQLite
