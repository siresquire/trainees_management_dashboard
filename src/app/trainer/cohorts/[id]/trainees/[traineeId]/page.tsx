import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import WeekTabs from "@/app/trainee/dashboard/WeekTabs";
import GraduationToggle from "@/app/trainer/cohorts/[id]/GraduationToggle";
import TraineeEditForm from "./TraineeEditForm";
import TraineeStatusActions from "./TraineeStatusActions";

export default async function TraineeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; traineeId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id: cohortId, traineeId } = await params;
  const { week: weekParam } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify trainer has cohort access
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  if (!isSuperAdmin) {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .single();
    if (!access) notFound();
  }

  // Trainee record (extended for edit form + status actions)
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, full_name, personal_email, amalitech_email, phone, gender, town, region, university, status, serial_no, graduated, deleted_at, cohorts(name, level)")
    .eq("id", traineeId)
    .eq("cohort_id", cohortId)
    .single();
  if (!trainee) notFound();

  // All cohort tasks
  const { data: allTasks } = await supabase
    .from("cohort_week_tasks")
    .select("id, week_number, task_name, task_type, display_order")
    .eq("cohort_id", cohortId)
    .order("week_number")
    .order("display_order");

  const tasks = allTasks ?? [];

  // This trainee's completions
  const { data: completions } = await supabase
    .from("completions")
    .select("task_id, score, completed_at")
    .eq("trainee_id", traineeId);

  const completionMap = new Map(
    (completions ?? []).map((c) => [c.task_id, c])
  );

  const kcTasks  = tasks.filter((t) => t.task_type === "kc");
  const labTasks = tasks.filter((t) => t.task_type === "lab");
  const kcsDone  = kcTasks.filter((t) => completionMap.has(t.id));
  const labsDone = labTasks.filter((t) => completionMap.has(t.id));
  const avgKcScore =
    kcsDone.length > 0
      ? Math.round(kcsDone.reduce((s, t) => s + (completionMap.get(t.id)?.score ?? 0), 0) / kcsDone.length)
      : null;

  const weeks = [...new Set(tasks.map((t) => t.week_number))].filter((w) => w > 0).sort((a, b) => a - b);
  const selectedWeek = weekParam ? Number(weekParam) : (weeks[0] ?? 1);
  const weekTasks = tasks.filter((t) => t.week_number === selectedWeek);
  const weekKcs   = weekTasks.filter((t) => t.task_type === "kc");
  const weekLabs  = weekTasks.filter((t) => t.task_type === "lab");

  // Cohort rank via leaderboard RPC
  const { data: leaderboard } = await supabase.rpc("get_cohort_leaderboard", { p_cohort_id: cohortId });
  const myRank = leaderboard?.find((r) => r.trainee_id === traineeId)?.rank ?? null;
  const cohortSize = leaderboard?.length ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link
        href={`/trainer/cohorts/${cohortId}`}
        className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 w-fit"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All trainees
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">{trainee.full_name}</h2>
              {trainee.graduated && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  🎓 Graduated
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{trainee.personal_email}</p>
            {trainee.amalitech_email && (
              <p className="text-xs text-slate-500">{trainee.amalitech_email}</p>
            )}
            {trainee.phone && (
              <p className="text-xs text-slate-500 mt-0.5">{trainee.phone}</p>
            )}
            {(trainee.town || trainee.region) && (
              <p className="text-xs text-slate-400 mt-0.5">
                {[trainee.town, trainee.region].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          <div className="text-right flex-shrink-0 space-y-2">
            <span className="text-xs text-slate-400 block">S/N {trainee.serial_no ?? "—"}</span>
            <TraineeStatusActions
              traineeId={trainee.id}
              cohortId={cohortId}
              status={trainee.status as "active" | "completed" | "dropped" | "suspended" | "disabled"}
              deletedAt={trainee.deleted_at ?? null}
              isSuperAdmin={isSuperAdmin}
            />
            {(trainee.cohorts as { level: string } | null)?.level !== "practitioner" && !trainee.deleted_at && (
              <GraduationToggle traineeId={trainee.id} graduated={trainee.graduated} />
            )}
          </div>
        </div>

        {/* Edit form */}
        <TraineeEditForm
          trainee={{
            id: trainee.id,
            full_name: trainee.full_name,
            personal_email: trainee.personal_email,
            amalitech_email: trainee.amalitech_email ?? null,
            phone: trainee.phone ?? null,
            gender: trainee.gender ?? null,
            town: trainee.town ?? null,
            region: trainee.region ?? null,
            university: trainee.university ?? null,
            serial_no: trainee.serial_no ?? null,
          }}
          cohortId={cohortId}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="KCs Done"    value={`${kcsDone.length} / ${kcTasks.length}`} sub={avgKcScore !== null ? `Avg ${avgKcScore}%` : undefined} accent={avgKcScore !== null && avgKcScore >= 80 ? "green" : avgKcScore !== null ? "amber" : "default"} />
        <StatCard label="Labs Done"   value={`${labsDone.length} / ${labTasks.length}`} />
        <StatCard label="Cohort Rank" value={myRank !== null ? `#${myRank}` : "—"} sub={cohortSize > 0 ? `of ${cohortSize}` : undefined} accent="blue" />
        <StatCard label="Overall"     value={tasks.length > 0 ? `${Math.round(((kcsDone.length + labsDone.length) / tasks.length) * 100)}%` : "—"} sub="completion" />
      </div>

      {/* Week breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 pt-4 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Weekly Progress</h2>
          {weeks.length > 0 ? (
            <Suspense>
              <WeekTabs weeks={weeks} />
            </Suspense>
          ) : (
            <p className="text-xs text-slate-400">No tasks assigned yet.</p>
          )}
        </div>

        {weekTasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No tasks for Week {selectedWeek}.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {weekKcs.length > 0 && (
              <section className="px-4 md:px-6 py-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Knowledge Checks ({weekKcs.length})
                </h3>
                <div className="space-y-2">
                  {weekKcs.map((task) => {
                    const comp = completionMap.get(task.id);
                    const score = comp?.score ?? null;
                    return (
                      <div key={task.id} className="flex items-center justify-between gap-3 py-1">
                        <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{task.task_name}</span>
                        {comp ? (
                          <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${score !== null && score >= 80 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {score !== null ? `${score}%` : "Submitted"}
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-xs text-slate-400">Not done</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {weekLabs.length > 0 && (
              <section className="px-4 md:px-6 py-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Labs ({weekLabs.length})
                </h3>
                <div className="space-y-2">
                  {weekLabs.map((task) => {
                    const done = completionMap.has(task.id);
                    return (
                      <div key={task.id} className="flex items-center justify-between gap-3 py-1">
                        <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{task.task_name}</span>
                        {done ? (
                          <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-green-600">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Done
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-xs text-slate-400">Pending</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent = "default" }: {
  label: string; value: string | number; sub?: string;
  accent?: "default" | "green" | "amber" | "blue";
}) {
  const subColor = accent === "green" ? "text-green-600" : accent === "amber" ? "text-amber-600" : accent === "blue" ? "text-blue-600" : "text-slate-400";
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>}
    </div>
  );
}
