import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AccountProfile from "@/components/account-profile";
import SessionManager from "@/components/session-manager";
import { getSessionUserFromCookies } from "@/lib/auth";
import { getNavLinks } from "@/lib/nav-links";

export default async function AccountPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");

  return (
    <DashboardShell username={user.username} role={user.role} links={getNavLinks(user.role)}>
      <AccountProfile />
      <SessionManager />
    </DashboardShell>
  );
}
