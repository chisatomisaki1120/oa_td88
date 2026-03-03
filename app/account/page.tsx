import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AccountProfile from "@/components/account-profile";
import { getSessionUserFromCookies } from "@/lib/auth";

export default async function AccountPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");

  const links = [{ href: "/account", label: "Tài khoản" }];
  if (user.role === "EMPLOYEE") {
    links.unshift({ href: "/employee/today", label: "Hôm nay" }, { href: "/employee/history", label: "Lịch sử" });
  } else {
    links.unshift(
      { href: "/admin/attendance", label: "Chấm công" },
      { href: "/admin/users", label: "Nhân sự" },
      { href: "/admin/shifts", label: "Ca làm" },
    );
  }

  return (
    <DashboardShell fullName={user.fullName} role={user.role} links={links}>
      <AccountProfile />
    </DashboardShell>
  );
}
