import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell, { type NavItem } from "@/components/AppShell";
import SessionGuard from "@/components/SessionGuard";

const NAV: NavItem[] = [
  { href: "/admin/overview",   label: "Overview",   icon: "chart",    exact: true },
  { href: "/admin/dashboard",  label: "Trainees",   icon: "grid",     exact: true },
  { href: "/admin/vouchers",   label: "Vouchers",   icon: "ticket",   exact: true },
  { href: "/admin/exams",      label: "Exams",      icon: "quiz",     exact: true },
  { href: "/admin/profile",    label: "Profile",    icon: "settings", exact: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!["admin", "super_admin"].includes(profile?.role ?? "")) redirect("/login");

  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <AppShell
      navItems={NAV}
      user={{ name: profile?.full_name ?? "Admin", role: profile?.role ?? "admin" }}
      settingsHref="/admin/profile"
      backHref={isSuperAdmin ? "/superadmin/dashboard" : undefined}
      backLabel={isSuperAdmin ? "Super Admin" : undefined}
    >
      <SessionGuard timeout={8 * 60 * 60 * 1000} />
      {children}
    </AppShell>
  );
}
