import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import WeekTabs from "./WeekTabs";

export default async function TraineeDashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: weekParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Trainee record + cohort info
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, full_name, cohort_id, status, graduated, cohorts(name, level, start_date, training_weeks)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!trainee) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-2">My Progress</h1>
        <p className="text-slate-500 text-sm">You are not currently enrolled in any cohort.</p>
      </div>
    );
  }

  const cohort = trainee.cohorts as {
    name: string; level: string; start_date: string; training_weeks: number;
  } | null;

  // All tasks for this cohort, grouped by week
  const { data: allTasks } = await supabase
    .from("cohort_week_tasks")
    .select("id, week_number, task_name, task_type, display_order")
    .eq("cohort_id", trainee.cohort_id)
    .order("week_number", { ascending: true })
    .order("display_order", { ascending: true });

  const tasks = allTasks ?? [];

  // My completions
  const { data: myCompletions } = await supabase
    .from("completions")
    .select("task_id, score, completed_at")
    .eq("trainee_id", trainee.id);

  const completionMap = new Map(
    (myCompletions ?? []).map((c) => [c.task_id, c])
  );

  // Compute overall stats
  const kcTasks   = tasks.filter((t) => t.task_type === "kc");
  const labTasks  = tasks.filter((t) => t.task_type === "lab");
  const kcsDone   = kcTasks.filter((t) => completionMap.has(t.id));
  const labsDone  = labTasks.filter((t) => completionMap.has(t.id));
  const avgKcScore =
    kcsDone.length > 0
      ? Math.round(
          kcsDone.reduce((s, t) => s + (completionMap.get(t.id)?.score ?? 0), 0) /
            kcsDone.length
        )
      : null;

  // Unique weeks that have tasks
  const weeks = [...new Set(tasks.map((t) => t.week_number))].filter((w) => w > 0).sort((a, b) => a - b);
  const selectedWeek = weekParam ? Number(weekParam) : (weeks[0] ?? 1);
  const videoTasks = tasks.filter((t) => t.task_type === "video");
  const videosDone = videoTasks.filter((t) => completionMap.has(t.id));

  const weekTasks   = tasks.filter((t) => t.week_number === selectedWeek);
  const weekKcs     = weekTasks.filter((t) => t.task_type === "kc");
  const weekLabs    = weekTasks.filter((t) => t.task_type === "lab");
  const weekVideos  = weekTasks.filter((t) => t.task_type === "video");

  // Leaderboard
  const { data: leaderboard } = await supabase.rpc("get_cohort_leaderboard", {
    p_cohort_id: trainee.cohort_id,
  });

  const myRank = leaderboard?.find((r) => r.trainee_id === trainee.id)?.rank ?? null;
  const cohortSize = leaderboard?.length ?? 0;
  const totalLabTasks = leaderboard?.[0]?.total_lab_tasks ?? labTasks.length;

  // Cohort type flags
  const isAssociate = cohort?.level === "associate";
  const hasCohortKcs = kcTasks.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-4xl">
      {/* Graduation banner */}
      {trainee.graduated && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">🎓</span>
          <div>
            <p className="font-semibold text-green-800">Congratulations — you have graduated!</p>
            <p className="text-sm text-green-700 mt-0.5">Your graduation has been recorded. AWS will issue your exam voucher based on this status.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">
          My Progress
        </h1>
        {cohort && (
          <p className="text-sm text-slate-500 mt-0.5">
            {cohort.name} &middot; AWS re/Start {cohort.level.charAt(0).toUpperCase() + cohort.level.slice(1)}
          </p>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {hasCohortKcs && (
          <StatCard
            label="KCs Done"
            value={`${kcsDone.length} / ${kcTasks.length}`}
            sub={avgKcScore !== null ? `Avg ${avgKcScore}%` : undefined}
            accent={avgKcScore !== null && avgKcScore >= 80 ? "green" : avgKcScore !== null ? "amber" : "default"}
          />
        )}
        <StatCard
          label="Labs Done"
          value={`${labsDone.length} / ${labTasks.length}`}
          sub={labTasks.length > 0 ? `${Math.round((labsDone.length / labTasks.length) * 100)}%` : undefined}
          accent={isAssociate && labsDone.length === labTasks.length && labTasks.length > 0 ? "green" : "default"}
        />
        <StatCard
          label="Cohort Rank"
          value={myRank !== null ? `#${myRank}` : "—"}
          sub={cohortSize > 0 ? `of ${cohortSize}` : undefined}
          accent="blue"
        />
        <StatCard
          label="Overall"
          value={
            tasks.length > 0
              ? `${Math.round(((kcsDone.length + labsDone.length + videosDone.length) / tasks.length) * 100)}%`
              : "—"
          }
          sub="completion"
          accent="default"
        />
      </div>

      {/* Week progress */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Weekly Tasks</h2>
          {weeks.length > 0 ? (
            <Suspense>
              <WeekTabs weeks={weeks} />
            </Suspense>
          ) : (
            <p className="text-xs text-slate-400">No tasks assigned yet.</p>
          )}
        </div>

        {weekTasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No tasks for Week {selectedWeek}.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* KCs */}
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
                        <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                          {task.task_name}
                        </span>
                        {comp ? (
                          <span
                            className={`flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              score !== null && score >= 80
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
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

            {/* Labs */}
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
                        <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                          {task.task_name}
                        </span>
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

            {/* Videos */}
            {weekVideos.length > 0 && (
              <section className="px-4 md:px-6 py-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Videos ({weekVideos.length})
                </h3>
                <div className="space-y-2">
                  {weekVideos.map((task) => {
                    const done = completionMap.has(task.id);
                    return (
                      <div key={task.id} className="flex items-center justify-between gap-3 py-1">
                        <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                          {task.task_name}
                        </span>
                        {done ? (
                          <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-purple-600">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Watched
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

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Cohort Leaderboard</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAssociate ? "Ranked by labs completed" : "Ranked by average KC score"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 w-10">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Name</th>
                  {!isAssociate && (
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">KC Avg</th>
                  )}
                  {!isAssociate && (
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">KCs</th>
                  )}
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">
                    {isAssociate ? "Labs" : "Labs"}
                  </th>
                  {isAssociate && totalLabTasks > 0 && (
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">%</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leaderboard.map((row) => {
                  const isMe = row.trainee_id === trainee.id;
                  const labPct =
                    isAssociate && totalLabTasks > 0
                      ? Math.round((Number(row.labs_completed) / totalLabTasks) * 100)
                      : null;
                  return (
                    <tr
                      key={row.trainee_id}
                      className={isMe ? "bg-blue-50" : "hover:bg-slate-50"}
                    >
                      <td className="px-4 py-2.5 text-slate-500 text-xs font-medium">
                        {Number(row.rank) <= 3 ? (
                          <span>{["🥇", "🥈", "🥉"][Number(row.rank) - 1]}</span>
                        ) : (
                          row.rank
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {row.full_name}
                        {isMe && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-normal">
                            you
                          </span>
                        )}
                      </td>
                      {!isAssociate && (
                        <td className="px-4 py-2.5 text-right">
                          {row.avg_kc_score !== null ? (
                            <span
                              className={`text-xs font-semibold ${
                                Number(row.avg_kc_score) >= 80 ? "text-green-600" : "text-red-500"
                              }`}
                            >
                              {row.avg_kc_score}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {!isAssociate && (
                        <td className="px-4 py-2.5 text-right text-xs text-slate-600">
                          {row.kcs_completed}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right text-xs text-slate-600">
                        {row.labs_completed}
                        {isAssociate && totalLabTasks > 0 && (
                          <span className="text-slate-400"> / {totalLabTasks}</span>
                        )}
                      </td>
                      {isAssociate && totalLabTasks > 0 && (
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`text-xs font-semibold ${
                              labPct !== null && labPct >= 80
                                ? "text-green-600"
                                : labPct !== null && labPct >= 50
                                ? "text-amber-600"
                                : "text-slate-500"
                            }`}
                          >
                            {labPct !== null ? `${labPct}%` : "—"}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, sub, accent = "default",
}: {
  label: string; value: string | number; sub?: string;
  accent?: "default" | "green" | "amber" | "blue";
}) {
  const subColor =
    accent === "green" ? "text-green-600" :
    accent === "amber" ? "text-amber-600" :
    accent === "blue"  ? "text-blue-600"  : "text-slate-400";

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>}
    </div>
  );
}
