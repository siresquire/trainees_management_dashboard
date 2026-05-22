import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WeekProgress from "./WeekProgress";

export default async function TraineeDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Trainee record + cohort info (including new fields)
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, full_name, cohort_id, status, graduated, cohorts(name, level, cohort_subtype, start_date, end_date, training_weeks, present_threshold_mins)")
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
    name: string; level: string; cohort_subtype: string | null;
    start_date: string; end_date: string | null;
    training_weeks: number; present_threshold_mins: number;
  } | null;

  const isPractitioner = cohort?.level === "practitioner";

  // Parallel fetches
  const [{ data: allTasks }, { data: myCompletions }, { data: sessions }] = await Promise.all([
    supabase
      .from("cohort_week_tasks")
      .select("id, week_number, task_name, task_type, display_order")
      .eq("cohort_id", trainee.cohort_id)
      .order("week_number", { ascending: true })
      .order("display_order", { ascending: true }),
    supabase
      .from("completions")
      .select("task_id, score, completed_at")
      .eq("trainee_id", trainee.id),
    supabase
      .from("sessions")
      .select("id, week_number")
      .eq("cohort_id", trainee.cohort_id),
  ]);

  const tasks = allTasks ?? [];
  const completionMap = new Map((myCompletions ?? []).map((c) => [c.task_id, c]));

  // Attendance for this trainee
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: myAttendanceRaw } = sessionIds.length
    ? await supabase
        .from("attendance")
        .select("session_id, status")
        .eq("trainee_id", trainee.id)
        .in("session_id", sessionIds)
    : { data: [] as { session_id: string; status: string }[] };
  const myAttendance = myAttendanceRaw ?? [];

  // ── Eligibility calculations ───────────────────────────────────────────────
  const THRESHOLD = 80;

  const attended = myAttendance.filter((a) => a.status === "present" || a.status === "partial");
  const totalSessions = (sessions ?? []).length;
  const overallAttPct = totalSessions > 0 ? (attended.length / totalSessions) * 100 : null;

  // Weeks 1-6 attendance
  const sessions1to6 = (sessions ?? []).filter((s) => s.week_number !== null && s.week_number >= 1 && s.week_number <= 6);
  const sessionIds1to6 = new Set(sessions1to6.map((s) => s.id));
  const attended1to6 = myAttendance.filter((a) => sessionIds1to6.has(a.session_id) && (a.status === "present" || a.status === "partial"));
  const att1to6Pct = sessions1to6.length > 0 ? (attended1to6.length / sessions1to6.length) * 100 : null;

  // Labs weeks 1-6
  const labs1to6 = tasks.filter((t) => t.task_type === "lab" && t.week_number != null && t.week_number >= 1 && t.week_number <= 6);
  const labsDone1to6 = labs1to6.filter((t) => completionMap.has(t.id));
  const labs1to6Pct = labs1to6.length > 0 ? (labsDone1to6.length / labs1to6.length) * 100 : null;

  // KCs weeks 1-6
  const kcs1to6 = tasks.filter((t) => t.task_type === "kc" && t.week_number != null && t.week_number >= 1 && t.week_number <= 6);
  const kcsDone1to6 = kcs1to6.filter((t) => completionMap.has(t.id));
  const kcs1to6Pct = kcs1to6.length > 0 ? (kcsDone1to6.length / kcs1to6.length) * 100 : null;

  const dataBundleEligible: boolean | null = overallAttPct !== null ? overallAttPct >= THRESHOLD : null;
  const stipend1Eligible: boolean | null =
    att1to6Pct !== null && labs1to6Pct !== null && kcs1to6Pct !== null
      ? att1to6Pct >= THRESHOLD && labs1to6Pct >= THRESHOLD && kcs1to6Pct >= THRESHOLD
      : null;
  const stipend2Eligible: boolean = !!trainee.graduated;

  // Countdown: show whenever end_date is set and cohort hasn't ended
  const msUntilEnd = cohort?.end_date ? new Date(cohort.end_date).getTime() - Date.now() : null;
  const daysUntilEnd = msUntilEnd !== null ? Math.ceil(msUntilEnd / (24 * 60 * 60 * 1000)) : null;
  const showCountdown = daysUntilEnd !== null && daysUntilEnd >= 0;

  // ── Overall stats ─────────────────────────────────────────────────────────
  const kcTasks   = tasks.filter((t) => t.task_type === "kc");
  const labTasks  = tasks.filter((t) => t.task_type === "lab");
  const kcsDone   = kcTasks.filter((t) => completionMap.has(t.id));
  const labsDone  = labTasks.filter((t) => completionMap.has(t.id));
  const avgKcScore =
    kcsDone.length > 0
      ? Math.round(kcsDone.reduce((s, t) => s + (completionMap.get(t.id)?.score ?? 0), 0) / kcsDone.length)
      : null;

  const weeks = [...new Set(tasks.map((t) => t.week_number))].filter((w) => w > 0).sort((a, b) => a - b);
  const videoTasks = tasks.filter((t) => t.task_type === "video");
  const videosDone = videoTasks.filter((t) => completionMap.has(t.id));

  const { data: leaderboard } = await supabase.rpc("get_cohort_leaderboard", {
    p_cohort_id: trainee.cohort_id,
  });

  const myRank = leaderboard?.find((r) => r.trainee_id === trainee.id)?.rank ?? null;
  const cohortSize = leaderboard?.length ?? 0;
  const totalLabTasks = leaderboard?.[0]?.total_lab_tasks ?? labTasks.length;
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

      {/* Countdown banner — visible for entire cohort duration */}
      {showCountdown && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 border ${
          daysUntilEnd === 0        ? "bg-red-50 border-red-200"   :
          daysUntilEnd! <= 7        ? "bg-amber-50 border-amber-200" :
                                      "bg-blue-50 border-blue-200"
        }`}>
          <svg className={`w-5 h-5 shrink-0 ${
            daysUntilEnd === 0   ? "text-red-500"   :
            daysUntilEnd! <= 7   ? "text-amber-500" :
                                   "text-blue-500"
          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className={`text-sm font-semibold ${
              daysUntilEnd === 0   ? "text-red-800"   :
              daysUntilEnd! <= 7   ? "text-amber-800" :
                                     "text-blue-800"
            }`}>
              {daysUntilEnd === 0
                ? "Training ends today!"
                : `${daysUntilEnd} day${daysUntilEnd !== 1 ? "s" : ""} remaining in training`}
            </p>
            <p className={`text-xs mt-0.5 ${
              daysUntilEnd === 0   ? "text-red-600"   :
              daysUntilEnd! <= 7   ? "text-amber-600" :
                                     "text-blue-600"
            }`}>
              Make sure your labs, KCs, and attendance are up to date.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">My Progress</h1>
        {cohort && (
          <p className="text-sm text-slate-500 mt-0.5">
            {cohort.name} &middot; AWS re/Start {cohort.level.charAt(0).toUpperCase() + cohort.level.slice(1)}
            {cohort.cohort_subtype && <> &middot; {cohort.cohort_subtype.charAt(0).toUpperCase() + cohort.cohort_subtype.slice(1)}</>}
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

      {/* Eligibility cards (practitioner cohorts) */}
      {isPractitioner && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Eligibility</h2>
          <p className="text-xs text-slate-400 mb-4">Requires ≥{THRESHOLD}% in each category</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <EligCard
              title="Data Bundle"
              eligible={dataBundleEligible}
              lines={[
                { label: "Overall attendance", pct: overallAttPct },
              ]}
            />
            <EligCard
              title="Stipend 1"
              eligible={stipend1Eligible}
              lines={[
                { label: "Attendance (wk 1–6)", pct: att1to6Pct },
                { label: "Labs (wk 1–6)",       pct: labs1to6Pct },
                { label: "KCs (wk 1–6)",        pct: kcs1to6Pct },
              ]}
            />
            <EligCard
              title="Stipend 2"
              eligible={stipend2Eligible}
              lines={[{ label: "Exam passed / graduated" }]}
              booleanResult
            />
          </div>
        </div>
      )}

      {/* Week progress */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-0">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Weekly Tasks</h2>
        </div>
        {weeks.length > 0 ? (
          <WeekProgress
            tasks={tasks}
            completions={myCompletions ?? []}
            weeks={weeks}
          />
        ) : (
          <div className="px-4 md:px-6 pb-4">
            <p className="text-xs text-slate-400">No tasks assigned yet.</p>
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
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Labs</th>
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
                    <tr key={row.trainee_id} className={isMe ? "bg-blue-50" : "hover:bg-slate-50"}>
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
                            <span className={`text-xs font-semibold ${Number(row.avg_kc_score) >= 80 ? "text-green-600" : "text-red-500"}`}>
                              {row.avg_kc_score}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {!isAssociate && (
                        <td className="px-4 py-2.5 text-right text-xs text-slate-600">{row.kcs_completed}</td>
                      )}
                      <td className="px-4 py-2.5 text-right text-xs text-slate-600">
                        {row.labs_completed}
                        {isAssociate && totalLabTasks > 0 && (
                          <span className="text-slate-400"> / {totalLabTasks}</span>
                        )}
                      </td>
                      {isAssociate && totalLabTasks > 0 && (
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs font-semibold ${labPct !== null && labPct >= 80 ? "text-green-600" : labPct !== null && labPct >= 50 ? "text-amber-600" : "text-slate-500"}`}>
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

// ── Eligibility card ──────────────────────────────────────────────────────────

function EligCard({
  title,
  eligible,
  lines,
  booleanResult,
}: {
  title: string;
  eligible: boolean | null;
  lines: Array<{ label: string; pct?: number | null }>;
  booleanResult?: boolean;
}) {
  const bg = eligible === true ? "bg-green-50 border-green-200"
           : eligible === false ? "bg-red-50 border-red-200"
           : "bg-slate-50 border-slate-200";
  const badge = eligible === true
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Eligible</span>
    : eligible === false
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Not eligible</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Pending</span>;

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {badge}
      </div>
      <div className="space-y-1.5">
        {lines.map((line) => {
          const met = booleanResult ? eligible : (line.pct !== undefined && line.pct !== null ? line.pct >= 80 : null);
          const pctStr = line.pct !== undefined && line.pct !== null ? `${Math.round(line.pct)}%` : null;
          return (
            <div key={line.label} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{line.label}</span>
              <span className={`font-medium ${met === true ? "text-green-600" : met === false ? "text-red-500" : "text-slate-400"}`}>
                {booleanResult ? (eligible ? "Yes" : "No") : (pctStr ?? "—")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

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
