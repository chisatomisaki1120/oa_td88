import { redirect } from "next/navigation";

export default function LegacySuperadminClosureRedirect() {
  redirect("/admin/attendance");
}
