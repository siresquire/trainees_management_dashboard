import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const LEVEL_BADGE: Record<string, string> = {
  practitioner: "bg-blue-100 text-blue-700",
  associate: "bg-purple-100 text-purple-700",
  devops: "bg-emerald-100 text-emerald-700",
};

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived:  "bg-amber-100 text-amber-700",
  deleted:   "bg-red-100 text-red-700",
};

export default async function TrainerDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";

  // Super admin sees all cohorts; trainers see their own via cohort_access
  let cohorts: Array<{
    id: string; name: string; code_name: string | null; level: string; platform: string;
    start_date: string; training_weeks: number; status: string;
  }> = [];

  if (isSuperAdmin) {
    const { data } = await supabase
      .from("cohorts")
      .select("id, name, code_name, level, platform, start_date, training_weeks, status")
      .order("start_date", { ascending: false });
    cohorts = data ?? [];
  } else {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("cohort_id")
      .eq("trainer_id", user.id);

    const cohortIds = (access ?? []).map((a) => a.cohort_id);
    if (cohortIds.length) {
      const { data } = await supabase
        .from("cohorts")
        .select("id, name, code_name, level, platform, start_date, training_weeks, status")
        .in("id", cohortIds)
        .order("start_date", { ascending: false });
      cohorts = data ?? [];
    }
  }

  // Parallel: owner names (embedded join) + active trainee counts
  const cohortIds = cohorts.map((c) => c.id);
  const [{ data: ownerAccess }, { data: traineeCounts }] = await Promise.all([
    cohortIds.length
      ? supabase
          .from("cohort_access")
          .select("cohort_id, trainer_id, profiles(full_name, role)")
          .in("cohort_id", cohortIds)
          .eq("role", "owner")
      : Promise.resolve({ data: [] as { cohort_id: string; trainer_id: string; profiles: { full_name: string; role: string } | null }[] }),
    cohortIds.length
      ? supabase.from("trainees").select("cohort_id").in("cohort_id", cohortIds).eq("status", "active")
      : Promise.resolve({ data: [] as { cohort_id: string }[] }),
  ]);

  // Map cohort_id → first non-superadmin owner name
  const ownerMap: Record<string, string> = {};
  for (const row of ownerAccess ?? []) {
    const prof = row.profiles as { full_name: string; role: string } | null;
    if (!prof) continue;
    if (!ownerMap[row.cohort_id] || prof.role !== "super_admin") {
      ownerMap[row.cohort_id] = prof.full_name;
    }
  }

  const countMap: Record<string, number> = {};
  for (const t of traineeCounts ?? []) {
    countMap[t.cohort_id] = (countMap[t.cohort_id] ?? 0) + 1;
  }

  const activeCohorts    = cohorts.filter((c) => c.status !== "deleted");
  const deletedCohorts   = cohorts.filter((c) => c.status === "deleted");

  const cohortBase = isSuperAdmin ? "/superadmin" : "/trainer";

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cohorts</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isSuperAdmin ? "All training cohorts across the platform" : "Manage your training cohorts"}
          </p>
        </div>
        <Link
          href={`${cohortBase}/cohorts/new`}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Cohort
        </Link>
      </div>

      {activeCohorts.length === 0 && deletedCohorts.length === 0 ? (
        <EmptyState href={`${cohortBase}/cohorts/new`} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeCohorts.map((cohort) => (
              <CohortCard
                key={cohort.id}
                cohort={cohort}
                owner={ownerMap[cohort.id]}
                traineeCount={countMap[cohort.id] ?? 0}
                href={`${cohortBase}/cohorts/${cohort.id}`}
              />
            ))}
          </div>

          {isSuperAdmin && deletedCohorts.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-slate-500 mb-3">
                Deleted ({deletedCohorts.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {deletedCohorts.map((cohort) => (
                  <CohortCard
                    key={cohort.id}
                    cohort={cohort}
                    owner={ownerMap[cohort.id]}
                    traineeCount={countMap[cohort.id] ?? 0}
                    href={`${cohortBase}/cohorts/${cohort.id}`}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CohortCard({
  cohort, owner, traineeCount, href,
}: {
  cohort: { id: string; name: string; code_name: string | null; level: string; platform: string; start_date: string; training_weeks: number; status: string };
  owner?: string;
  traineeCount: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-orange-300 hover:shadow-sm transition-all group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${LEVEL_BADGE[cohort.level] ?? "bg-slate-100 text-slate-600"}`}>
          {cohort.level}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[cohort.status] ?? "bg-slate-100 text-slate-600"}`}>
          {cohort.status}
        </span>
      </div>

      <div>
        <h3 className="font-semibold text-slate-900 group-hover:text-orange-600 transition-colors leading-tight">
          {cohort.name}
        </h3>
        {cohort.code_name && cohort.code_name !== cohort.name && (
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            {cohort.code_name}
          </p>
        )}
        <p className="text-xs text-slate-500 mt-0.5">
          Started {new Date(cohort.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {" · "}{cohort.training_weeks}w
        </p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {traineeCount} active trainee{traineeCount !== 1 ? "s" : ""}
        </div>
        {owner && (
          <span className="text-xs text-slate-400 truncate max-w-[120px]" title={owner}>
            {owner}
          </span>
        )}
      </div>
    </Link>
  );
}

function EmptyState({ href }: { href: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-slate-900 mb-1">No cohorts yet</h3>
      <p className="text-sm text-slate-500 mb-4">Create your first cohort to get started.</p>
      <Link
        href={href}
        className="inline-flex items-center bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        Create cohort
      </Link>
    </div>
  );
}
