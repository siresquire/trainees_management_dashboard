import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminProfileClient from "./AdminProfileClient";

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_active").eq("id", user.id).single(),
    createServiceClient().from("admin_settings").select("level, exam_passing_score"),
  ]);

  if (!profile || !["admin", "super_admin"].includes(profile.role)) redirect("/login");

  const passingScores: Record<string, number> = {};
  for (const s of settings ?? []) {
    passingScores[s.level as string] = Number((s as Record<string, unknown>).exam_passing_score ?? 700);
  }

  return (
    <AdminProfileClient
      userId={user.id}
      fullName={profile.full_name}
      email={user.email ?? ""}
      role={profile.role}
      passingScores={passingScores}
    />
  );
}
