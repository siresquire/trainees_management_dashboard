import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell, { type NavItem } from "@/components/AppShell";
import OnlinePresence from "@/components/OnlinePresence";

const NAV: NavItem[] = [
  { href: "/trainee/dashboard", label: "My Progress", icon: "home",     exact: true },
  { href: "/trainee/quizzes",   label: "My Quizzes",  icon: "quiz"                  },
  { href: "/trainee/exams",     label: "My Exams",    icon: "chart"                 },
  { href: "/trainee/settings",  label: "Settings",    icon: "settings"              },
];

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "trainee") redirect("/login");
  if (!profile.is_active) redirect("/suspended");

  return (
    <AppShell navItems={NAV} user={{ name: profile.full_name, role: profile.role }} theme="light" settingsHref="/trainee/settings">
      <OnlinePresence />
      {children}
    </AppShell>
  );
}
