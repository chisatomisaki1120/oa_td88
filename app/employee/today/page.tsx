import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import EmployeeToday from "@/components/employee-today";
import { requireRoleServer } from "@/lib/rbac";
import { EMPLOYEE_NAV_LINKS } from "@/lib/nav-links";

export default async function EmployeeTodayPage() {
  const user = await requireRoleServer([Role.EMPLOYEE]);
  if (!user) redirect("/login");

  return (
    <DashboardShell username={user.username} role={user.role} links={EMPLOYEE_NAV_LINKS}>
      <EmployeeToday />
    </DashboardShell>
  );
}
