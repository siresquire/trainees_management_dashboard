import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { loadAttendanceThresholdMins } from "@/actions/admin-settings";
import CohortSettingsForm from "./CohortSettingsForm";

export default async function CohortSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin" || isSuperAdmin;

  if (!isSuperAdmin) {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", id)
      .eq("trainer_id", user.id)
      .single();
    if (!access) notFound();
  }

  const svc = createServiceClient();
  const [{ data: cohort }, thresholdMins] = await Promise.all([
    svc
      .from("cohorts")
      .select("id, name, code_name, level, cohort_subtype, start_date, end_date, training_weeks, exam_prep_weeks, present_threshold_mins")
      .eq("id", id)
      .single(),
    loadAttendanceThresholdMins(),
  ]);

  if (!cohort) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Cohort Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">Edit cohort metadata. Training weeks are calculated automatically from the date range.</p>
      </div>
      <CohortSettingsForm
        cohortId={id}
        cohort={{
          name:                  cohort.name,
          level:                 cohort.level,
          cohort_subtype:        cohort.cohort_subtype,
          start_date:            cohort.start_date,
          end_date:              cohort.end_date,
          exam_prep_weeks:       cohort.exam_prep_weeks,
          present_threshold_mins: cohort.present_threshold_mins,
        }}
        isAdmin={isAdmin}
        universityMins={thresholdMins.universityMins}
        externalMins={thresholdMins.externalMins}
      />
    </div>
  );
}
