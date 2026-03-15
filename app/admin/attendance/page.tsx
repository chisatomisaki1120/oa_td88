import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminAttendance from "@/components/admin-attendance";
import { requireRoleServer } from "@/lib/rbac";
import { ADMIN_NAV_LINKS } from "@/lib/nav-links";
import { buildMonthOptionsFromMonth, vnDateString, vnMonthString } from "@/lib/time";

export default async function AdminAttendancePage() {
  const user = await requireRoleServer([Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) redirect("/login");
  const initialDate = vnDateString();
  const initialMonth = vnMonthString();
  const monthOptions = buildMonthOptionsFromMonth(initialMonth);

  return (
    <DashboardShell username={user.username} role={user.role} links={ADMIN_NAV_LINKS}>
      <AdminAttendance initialDate={initialDate} initialMonth={initialMonth} monthOptions={monthOptions} />
    </DashboardShell>
  );
}
