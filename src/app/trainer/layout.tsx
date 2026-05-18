import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell, { type NavItem } from "@/components/AppShell";

const NAV: NavItem[] = [
  { href: "/trainer/dashboard",       label: "Cohorts",        icon: "grid",     exact: true },
  { href: "/trainer/question-banks",  label: "Question Banks", icon: "quiz"                  },
  { href: "/trainer/profile",         label: "My Profile",     icon: "settings", exact: true },
];

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["trainer", "quiz_creator", "super_admin"].includes(profile.role)) redirect("/login");

  const nav: NavItem[] = [
    ...NAV,
    ...(profile.role === "super_admin"
      ? [{ href: "/superadmin/dashboard", label: "Super Admin", icon: "shield" as const }]
      : []),
  ];

  return (
    <AppShell
      navItems={nav}
      user={{ name: profile.full_name, role: profile.role }}
      theme="light"
    >
      {children}
    </AppShell>
  );
}
