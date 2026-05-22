import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewCohortForm from "./NewCohortForm";
import { loadAttendanceThresholdMins } from "@/actions/admin-settings";

export default async function NewCohortPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, thresholdMins] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    loadAttendanceThresholdMins(),
  ]);

  return (
    <NewCohortForm
      backHref="/trainer/dashboard"
      role={profile?.role ?? "trainer"}
      universityMins={thresholdMins.universityMins}
      externalMins={thresholdMins.externalMins}
    />
  );
}
