import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewCohortForm from "@/app/trainer/cohorts/new/NewCohortForm";

export default async function SuperAdminNewCohortPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") redirect("/login");

  // Active trainers and quiz creators who can be assigned
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["trainer", "quiz_creator"])
    .eq("is_active", true)
    .order("full_name");

  return (
    <NewCohortForm
      backHref="/superadmin/dashboard"
      assignableStaff={staff ?? []}
    />
  );
}
