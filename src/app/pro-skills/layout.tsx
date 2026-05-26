import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell, { type NavItem } from "@/components/AppShell";

const NAV: NavItem[] = [
  { href: "/pro-skills/dashboard", label: "My Cohorts", icon: "grid",     exact: true },
  { href: "/trainer/profile",      label: "My Profile", icon: "settings" },
];

export default async function ProSkillsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  // Also allow super_admin/admin to visit these pages for oversight
  if (!profile || !["pro_skills_instructor", "super_admin", "admin"].includes(profile.role)) {
    redirect("/login");
  }

  return (
    <AppShell
      navItems={NAV}
      user={{ name: profile.full_name, role: profile.role }}
      theme="light"
      settingsHref="/trainer/profile"
    >
      {children}
    </AppShell>
  );
}
