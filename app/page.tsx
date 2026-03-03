import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");

  if (user.role === "EMPLOYEE") {
    redirect("/employee/today");
  }
  if (user.role === "ADMIN") {
    redirect("/admin/attendance");
  }
  redirect("/admin/attendance");
}
