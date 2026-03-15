import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminUsers from "@/components/admin-users";
import { requireRoleServer } from "@/lib/rbac";
import { ADMIN_NAV_LINKS } from "@/lib/nav-links";
import { buildMonthOptionsFromMonth, vnMonthString } from "@/lib/time";

export default async function AdminUsersPage() {
  const user = await requireRoleServer([Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) redirect("/login");
  const initialMonth = vnMonthString();
  const monthOptions = buildMonthOptionsFromMonth(initialMonth);

  return (
    <DashboardShell username={user.username} role={user.role} links={ADMIN_NAV_LINKS}>
      <AdminUsers actorRole={user.role} initialMonth={initialMonth} monthOptions={monthOptions} />
    </DashboardShell>
  );
}
