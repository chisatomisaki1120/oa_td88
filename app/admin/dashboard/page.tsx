import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminDashboard from "@/components/admin-dashboard";
import { requireRoleServer } from "@/lib/rbac";

export default async function AdminDashboardPage() {
  const user = await requireRoleServer([Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) redirect("/login");

  return (
    <DashboardShell
      fullName={user.fullName}
      role={user.role}
      links={[
        { href: "/admin/attendance", label: "Chấm công" },
        { href: "/admin/users", label: "Nhân sự" },
        { href: "/admin/shifts", label: "Ca làm" },
        { href: "/admin/payroll", label: "Bảng lương" },
        { href: "/admin/dashboard", label: "Thống kê" },
        { href: "/admin/settings", label: "Cài đặt" },
        { href: "/account", label: "Tài khoản" },
      ]}
    >
      <AdminDashboard />
    </DashboardShell>
  );
}
