import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminSettingsTabs from "@/components/admin-settings-tabs";
import AdminSecuritySettings from "@/components/admin-security-settings";
import AdminDbTools from "@/components/admin-db-tools";
import AdminSessions from "@/components/admin-sessions";
import ImportAttendance from "@/components/import-attendance";
import ImportEmployees from "@/components/import-employees";
import ImportDbJson from "@/components/import-db-json";
import { requireRoleServer } from "@/lib/rbac";
import { ADMIN_NAV_LINKS } from "@/lib/nav-links";

export default async function AdminSettingsPage() {
  const user = await requireRoleServer([Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) redirect("/login");

  return (
    <DashboardShell username={user.username} role={user.role} links={ADMIN_NAV_LINKS}>
      <AdminSettingsTabs
        tabs={[
          { key: "security", label: "Bảo mật", icon: "🔒", children: <><AdminSecuritySettings /><AdminSessions /></> },
          { key: "import", label: "Import", icon: "📥", children: <><ImportEmployees /><ImportAttendance /><ImportDbJson /></> },
          { key: "data", label: "Dữ liệu", icon: "💾", children: <AdminDbTools /> },
        ]}
      />
    </DashboardShell>
  );
}
