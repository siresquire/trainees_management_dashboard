import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell, { type NavItem } from "@/components/AppShell";

const NAV: NavItem[] = [
  { href: "/superadmin/dashboard",             label: "Dashboard",    icon: "grid",    exact: true },
  { href: "/superadmin/graduation-thresholds", label: "Grad Thresholds", icon: "chart" },
  { href: "/trainer/dashboard",                label: "Trainer view", icon: "users"              },
  { href: "/admin/dashboard",                  label: "Admin view",   icon: "shield"             },
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") redirect("/login");

  return (
    <AppShell navItems={NAV} user={{ name: profile.full_name, role: profile.role }} theme="dark">
      {children}
    </AppShell>
  );
}
