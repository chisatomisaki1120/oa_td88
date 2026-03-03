import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminAttendance from "@/components/admin-attendance";
import { requireRoleServer } from "@/lib/rbac";

export default async function AdminAttendancePage() {
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
        { href: "/account", label: "Tài khoản" },
      ]}
    >
      <AdminAttendance />
    </DashboardShell>
  );
}
