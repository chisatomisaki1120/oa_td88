import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import EmployeeHistory from "@/components/employee-history";
import { requireRoleServer } from "@/lib/rbac";

export default async function EmployeeHistoryPage() {
  const user = await requireRoleServer([Role.EMPLOYEE]);
  if (!user) redirect("/login");

  return (
    <DashboardShell
      fullName={user.fullName}
      role={user.role}
      links={[
        { href: "/employee/today", label: "Hôm nay" },
        { href: "/employee/history", label: "Lịch sử" },
        { href: "/account", label: "Tài khoản" },
      ]}
    >
      <EmployeeHistory />
    </DashboardShell>
  );
}
