export type NavLink = { href: string; label: string };

export const ADMIN_NAV_LINKS: NavLink[] = [
  { href: "/admin/attendance", label: "Chấm công" },
  { href: "/admin/leave-requests", label: "Nghỉ phép" },
  { href: "/admin/users", label: "Nhân sự" },
  { href: "/admin/shifts", label: "Ca làm" },
  { href: "/admin/payroll", label: "Bảng lương" },
  { href: "/admin/dashboard", label: "Thống kê" },
  { href: "/admin/settings", label: "Cài đặt" },
  { href: "/account", label: "Tài khoản" },
];

export const EMPLOYEE_NAV_LINKS: NavLink[] = [
  { href: "/employee/today", label: "Hôm nay" },
  { href: "/employee/history", label: "Lịch sử" },
  { href: "/account", label: "Tài khoản" },
];

export function getNavLinks(role: string): NavLink[] {
  return role === "EMPLOYEE" ? EMPLOYEE_NAV_LINKS : ADMIN_NAV_LINKS;
}
