import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import ThemeToggle from "@/components/theme-toggle";
import { roleLabel } from "@/lib/display-labels";

type Props = {
  fullName: string;
  role: string;
  links: Array<{ href: string; label: string }>;
};

export default function DashboardShell({ fullName, role, links, children }: React.PropsWithChildren<Props>) {
  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>OA TD88 - Chấm công</h2>
            <p className="small" style={{ margin: "4px 0 0" }}>
              {fullName} ({roleLabel(role)})
            </p>
          </div>
          <div className="row">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </div>
      <div className="nav">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
      <div>{children}</div>
    </div>
  );
}
