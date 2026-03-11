import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import EmployeeHistory from "@/components/employee-history";
import { requireRoleServer } from "@/lib/rbac";
import { EMPLOYEE_NAV_LINKS } from "@/lib/nav-links";

export default async function EmployeeHistoryPage() {
  const user = await requireRoleServer([Role.EMPLOYEE]);
  if (!user) redirect("/login");

  return (
    <DashboardShell username={user.username} role={user.role} links={EMPLOYEE_NAV_LINKS}>
      <EmployeeHistory />
    </DashboardShell>
  );
}
