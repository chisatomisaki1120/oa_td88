import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminLeaveRequests from "@/components/admin-leave-requests";
import { requireRoleServer } from "@/lib/rbac";
import { ADMIN_NAV_LINKS } from "@/lib/nav-links";
import { vnDateString } from "@/lib/time";

export default async function AdminLeaveRequestsPage() {
  const user = await requireRoleServer([Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) redirect("/login");
  const initialYear = Number(vnDateString().slice(0, 4));

  return (
    <DashboardShell username={user.username} role={user.role} links={ADMIN_NAV_LINKS}>
      <AdminLeaveRequests initialYear={initialYear} />
    </DashboardShell>
  );
}
