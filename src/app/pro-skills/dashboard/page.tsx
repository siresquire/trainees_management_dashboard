import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const LEVEL_BADGE: Record<string, string> = {
  practitioner: "bg-blue-100 text-blue-700",
  associate:    "bg-purple-100 text-purple-700",
  devops:       "bg-emerald-100 text-emerald-700",
};

export default async function ProSkillsDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin      = profile?.role === "admin" || isSuperAdmin;

  type CohortRow = {
    id: string; name: string; code_name: string | null; level: string;
    start_date: string; end_date: string | null; training_weeks: number; status: string;
  };

  let cohorts: CohortRow[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("cohorts")
      .select("id, name, code_name, level, start_date, end_date, training_weeks, status")
      .order("start_date", { ascending: false });
    cohorts = (data ?? []) as CohortRow[];
  } else {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("cohort_id")
      .eq("trainer_id", user.id)
      .eq("role", "pro_skills");

    const ids = (access ?? []).map((a) => a.cohort_id);
    if (ids.length) {
      const { data } = await supabase
        .from("cohorts")
        .select("id, name, code_name, level, start_date, end_date, training_weeks, status")
        .in("id", ids)
        .order("start_date", { ascending: false });
      cohorts = (data ?? []) as CohortRow[];
    }
  }

  // Trainee counts
  const cohortIds = cohorts.map((c) => c.id);
  const { data: traineeCounts } = cohortIds.length
    ? await supabase
        .from("trainees")
        .select("cohort_id")
        .in("cohort_id", cohortIds)
        .is("deleted_at", null)
        .eq("status", "active")
    : { data: [] as { cohort_id: string }[] };

  const countMap: Record<string, number> = {};
  for (const t of traineeCounts ?? []) {
    countMap[t.cohort_id] = (countMap[t.cohort_id] ?? 0) + 1;
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-bold text-slate-900">My Cohorts</h1>
        <p className="text-slate-500 text-sm mt-0.5">Cohorts assigned to you for Professional Skills instruction</p>
      </div>

      {cohorts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-slate-900 mb-1">No cohorts assigned</h3>
          <p className="text-sm text-slate-500">Ask your trainer or admin to assign you to a cohort.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cohorts.map((cohort) => (
            <Link
              key={cohort.id}
              href={`/pro-skills/cohorts/${cohort.id}`}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-orange-300 hover:shadow-sm transition-all group flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${LEVEL_BADGE[cohort.level] ?? "bg-slate-100 text-slate-600"}`}>
                  {cohort.level}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                  cohort.status === "active" ? "bg-green-100 text-green-700" :
                  cohort.status === "completed" ? "bg-blue-100 text-blue-700" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {cohort.status}
                </span>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 group-hover:text-orange-600 transition-colors leading-tight">
                  {cohort.name}
                </h3>
                {cohort.code_name && cohort.code_name !== cohort.name && (
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{cohort.code_name}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(cohort.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {cohort.end_date && (
                    <> – {new Date(cohort.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
                  )}
                  {" · "}{cohort.training_weeks}w
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-auto">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {countMap[cohort.id] ?? 0} active trainee{(countMap[cohort.id] ?? 0) !== 1 ? "s" : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
