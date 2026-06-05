import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WeekProgress from "./WeekProgress";
import VisitTracker from "@/components/VisitTracker";
import AttendanceCard from "./AttendanceCard";

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
  const [{ data: allTasks }, { data: myCompletions }, { data: sessions }, { data: myExamOutcomes }] = await Promise.all([
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
      .select("id, week_number, session_number, topic, started_at, total_duration_mins")
      .eq("cohort_id", trainee.cohort_id)
      .order("started_at", { ascending: false }),
    supabase
      .from("exam_outcomes")
      .select("outcome")
      .eq("trainee_id", trainee.id),
  ]);

  const tasks = allTasks ?? [];
  const completionMap = new Map((myCompletions ?? []).map((c) => [c.task_id, c]));

  // Attendance for this trainee
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: myAttendanceRaw } = sessionIds.length
    ? await supabase
        .from("attendance")
        .select("session_id, status, duration_mins")
        .eq("trainee_id", trainee.id)
        .in("session_id", sessionIds)
    : { data: [] as { session_id: string; status: string }[] };
  const myAttendance = myAttendanceRaw ?? [];

  // ── Eligibility calculations ───────────────────────────────────────────────
  const THRESHOLD = 80;

  const attended = myAttendance.filter((a) => a.status === "present");
  const totalSessions = (sessions ?? []).length;
  const overallAttPct = totalSessions > 0 ? (attended.length / totalSessions) * 100 : null;

  // Weeks 1-6 attendance
  const sessions1to6 = (sessions ?? []).filter((s) => s.week_number !== null && s.week_number >= 1 && s.week_number <= 6);
  const sessionIds1to6 = new Set(sessions1to6.map((s) => s.id));
  const attended1to6 = myAttendance.filter((a) => sessionIds1to6.has(a.session_id) && a.status === "present");
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
  // Stipend 2 requires a genuinely passed AWS exam result — graduation alone is not enough.
  const examPassed: boolean = (myExamOutcomes ?? []).some((o) => o.outcome === "passed");
  const stipend2Eligible: boolean = examPassed;

  // ── Associate eligibility (3 × 4-week data-bundle periods) ───────────────
  // Tier: "eligible" ≥80% both, "minimum" ≥65% both, "ineligible" <65% either, null = no data
  type AssocTier = "eligible" | "minimum" | "ineligible" | null;
  function assocTier(labsPct: number | null, attPct: number | null): AssocTier {
    if (labsPct === null || attPct === null) return null;
    const lo = Math.min(labsPct, attPct);
    if (lo >= 80) return "eligible";
    if (lo >= 65) return "minimum";
    return "ineligible";
  }

  function periodPcts(fromWk: number, toWk: number) {
    // Attendance: independent per period — past sessions cannot be retaken
    const pSessions = (sessions ?? []).filter(
      (s) => s.week_number !== null && s.week_number >= fromWk && s.week_number <= toWk
    );
    const pAttended = myAttendance.filter(
      (a) => pSessions.some((s) => s.id === a.session_id) && a.status === "present"
    );
    // Labs: CUMULATIVE from week 1 — prevents gaming by skipping early labs.
    // e.g. Bundle 2 requires ≥65% of ALL labs weeks 1–8, not just 5–8.
    const pLabs = tasks.filter(
      (t) => t.task_type === "lab" && t.week_number != null && t.week_number >= 1 && t.week_number <= toWk
    );
    const pLabsDone = pLabs.filter((t) => completionMap.has(t.id));
    return {
      attPct:  pSessions.length > 0 ? (pAttended.length / pSessions.length) * 100 : null,
      labsPct: pLabs.length > 0     ? (pLabsDone.length / pLabs.length)     * 100 : null,
    };
  }

  const assocP1 = periodPcts(1, 4);
  const assocP2 = periodPcts(5, 8);
  const assocP3 = periodPcts(9, 12);
  const assocTier1 = assocTier(assocP1.labsPct, assocP1.attPct);
  const assocTier2 = assocTier(assocP2.labsPct, assocP2.attPct);
  const assocTier3 = assocTier(assocP3.labsPct, assocP3.attPct);

  // Countdown: show whenever end_date is set and cohort hasn't ended
  const msUntilEnd = cohort?.end_date ? new Date(cohort.end_date).getTime() - Date.now() : null;
  const daysUntilEnd = msUntilEnd !== null ? Math.ceil(msUntilEnd / (24 * 60 * 60 * 1000)) : null;
  const showCountdown = daysUntilEnd !== null && daysUntilEnd >= 0;

  // Current week
  const msFromStart = cohort?.start_date ? Date.now() - new Date(cohort.start_date).getTime() : null;
  const currentWeek = msFromStart !== null && cohort
    ? Math.min(Math.max(1, Math.ceil(msFromStart / (7 * 24 * 60 * 60 * 1000))), cohort.training_weeks)
    : null;

  // Stipend 1 nudge — show when still in wks 1-6 and not yet eligible
  const labsNeededForStipend1 = labs1to6.length > 0
    ? Math.max(0, Math.ceil(labs1to6.length * 0.8) - labsDone1to6.length)
    : 0;
  const kcsNeededForStipend1 = kcs1to6.length > 0
    ? Math.max(0, Math.ceil(kcs1to6.length * 0.8) - kcsDone1to6.length)
    : 0;
  const attBelowThreshold = att1to6Pct !== null && att1to6Pct < THRESHOLD;
  const showStipend1Nudge =
    isPractitioner &&
    stipend1Eligible !== true &&
    currentWeek !== null && currentWeek <= 6 &&
    (labsNeededForStipend1 > 0 || kcsNeededForStipend1 > 0 || attBelowThreshold);

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

  // Pro skills data
  const [{ data: proSkillsSessions }, { data: proSkillsAssignments }] = await Promise.all([
    supabase
      .from("pro_skills_sessions")
      .select("id, title, session_date, pro_skills_attendance(status)")
      .eq("cohort_id", trainee.cohort_id)
      .eq("pro_skills_attendance.trainee_id", trainee.id)
      .order("session_date", { ascending: false })
      .limit(5),
    supabase
      .from("pro_skills_assignments")
      .select("id, title, due_date, pro_skills_submissions(completed)")
      .eq("cohort_id", trainee.cohort_id)
      .eq("pro_skills_submissions.trainee_id", trainee.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const myRank = leaderboard?.find((r) => r.trainee_id === trainee.id)?.rank ?? null;
  const cohortSize = leaderboard?.length ?? 0;
  const totalLabTasks = leaderboard?.[0]?.total_lab_tasks ?? labTasks.length;
  const isAssociate = cohort?.level === "associate";
  const hasCohortKcs = kcTasks.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-4xl">
      <VisitTracker />
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

      {/* Countdown + current week banner */}
      {showCountdown && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 border ${
          daysUntilEnd === 0   ? "bg-red-50 border-red-200"     :
          daysUntilEnd! <= 7   ? "bg-amber-50 border-amber-200" :
                                 "bg-blue-50 border-blue-200"
        }`}>
          <svg className={`w-5 h-5 shrink-0 ${
            daysUntilEnd === 0   ? "text-red-500"   :
            daysUntilEnd! <= 7   ? "text-amber-500" :
                                   "text-blue-500"
          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className={`text-sm font-semibold ${
                daysUntilEnd === 0   ? "text-red-800"   :
                daysUntilEnd! <= 7   ? "text-amber-800" :
                                       "text-blue-800"
              }`}>
                {daysUntilEnd === 0
                  ? "Training ends today!"
                  : `${daysUntilEnd} day${daysUntilEnd !== 1 ? "s" : ""} remaining in training`}
              </p>
              {currentWeek !== null && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  daysUntilEnd === 0   ? "bg-red-100 text-red-700"     :
                  daysUntilEnd! <= 7   ? "bg-amber-100 text-amber-700" :
                                         "bg-blue-100 text-blue-700"
                }`}>
                  Week {currentWeek} of {cohort?.training_weeks}
                </span>
              )}
            </div>
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

      {/* Stipend 1 nudge banner — practitioner only, weeks 1–6, not yet eligible */}
      {showStipend1Nudge && (
        <div className="rounded-2xl p-4 flex gap-3 border bg-orange-50 border-orange-200">
          <svg className="w-5 h-5 shrink-0 text-orange-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-orange-800">
              Stipend 1 — you&apos;re still in the qualification window (Week {currentWeek} of 6)
            </p>
            <p className="text-xs text-orange-700 mt-1 mb-2">
              To qualify you need ≥80% completion in Labs, KCs, and Attendance for Weeks 1–6.
              Here&apos;s what&apos;s still needed:
            </p>
            <ul className="space-y-1">
              {labsNeededForStipend1 > 0 && (
                <li className="flex items-center gap-1.5 text-xs text-orange-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  <span>
                    <strong>{labsNeededForStipend1} more Lab{labsNeededForStipend1 !== 1 ? "s" : ""}</strong>
                    {" "}to complete in Weeks 1–6
                    <span className="ml-1 text-orange-500">
                      (currently {labs1to6Pct !== null ? `${Math.round(labs1to6Pct)}%` : "—"})
                    </span>
                  </span>
                </li>
              )}
              {kcsNeededForStipend1 > 0 && (
                <li className="flex items-center gap-1.5 text-xs text-orange-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  <span>
                    <strong>{kcsNeededForStipend1} more KC{kcsNeededForStipend1 !== 1 ? "s" : ""}</strong>
                    {" "}to complete in Weeks 1–6
                    <span className="ml-1 text-orange-500">
                      (currently {kcs1to6Pct !== null ? `${Math.round(kcs1to6Pct)}%` : "—"})
                    </span>
                  </span>
                </li>
              )}
              {attBelowThreshold && (
                <li className="flex items-center gap-1.5 text-xs text-orange-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  <span>
                    Attendance in Weeks 1–6 is below 80%
                    <span className="ml-1 text-orange-500">
                      (currently {att1to6Pct !== null ? `${Math.round(att1to6Pct)}%` : "—"})
                    </span>
                  </span>
                </li>
              )}
            </ul>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
        {/* Attendance — clickable card opens session-by-session detail panel */}
        <AttendanceCard
          attended={attended.length}
          totalSessions={totalSessions}
          overallAttPct={overallAttPct}
          sessions={(sessions ?? []).map((s) => ({
            id:               s.id,
            week_number:      s.week_number,
            session_number:   (s as Record<string, unknown>).session_number as number | null ?? null,
            topic:            (s as Record<string, unknown>).topic as string | null ?? null,
            started_at:       (s as Record<string, unknown>).started_at as string,
            total_duration_mins: (s as Record<string, unknown>).total_duration_mins as number,
          }))}
          attendanceMap={Object.fromEntries(
            (myAttendance).map((a) => [
              a.session_id,
              { status: a.status, duration_mins: (a as Record<string, unknown>).duration_mins as number ?? 0 },
            ])
          )}
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
              lines={[{ label: "AWS exam passed" }]}
              booleanResult
            />
          </div>
        </div>
      )}

      {/* Eligibility cards (associate cohorts) */}
      {isAssociate && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Eligibility</h2>
          <p className="text-xs text-slate-400 mb-4">
            ≥80% = eligible (green) · ≥65% = minimum (amber) · &lt;65% = not eligible (red).
            Labs are cumulative — later bundles require all prior labs to be done.
            Attendance is per period only. Stipend paid on AWS exam pass.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <AssocPeriodCard label="Data Bundle 1" period="Labs wks 1–4 · Att wks 1–4"  tier={assocTier1} labsPct={assocP1.labsPct} attPct={assocP1.attPct} />
            <AssocPeriodCard label="Data Bundle 2" period="Labs wks 1–8 · Att wks 5–8"  tier={assocTier2} labsPct={assocP2.labsPct} attPct={assocP2.attPct} />
            <AssocPeriodCard label="Data Bundle 3" period="Labs wks 1–12 · Att wks 9–12" tier={assocTier3} labsPct={assocP3.labsPct} attPct={assocP3.attPct} />
            <AssocStipendCard passed={examPassed} />
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

      {/* Professional Skills */}
      {(proSkillsSessions && proSkillsSessions.length > 0) || (proSkillsAssignments && proSkillsAssignments.length > 0) ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Professional Skills</h2>

          {/* Sessions */}
          {proSkillsSessions && proSkillsSessions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 mb-2">Recent Sessions</h3>
              <div className="space-y-1.5">
                {proSkillsSessions.map((session) => {
                  const attRows = (session.pro_skills_attendance as unknown as { status: string }[] | null) ?? [];
                  const attStatus = attRows[0]?.status ?? null;
                  return (
                    <div key={session.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-slate-900">{session.title}</span>
                        <span className="text-slate-400 ml-1.5">
                          {new Date(session.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                      {attStatus === "present" && (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Present</span>
                      )}
                      {attStatus === "late" && (
                        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Late</span>
                      )}
                      {attStatus === "absent" && (
                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Absent</span>
                      )}
                      {!attStatus && (
                        <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assignments */}
          {proSkillsAssignments && proSkillsAssignments.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 mb-2">Recent Assignments</h3>
              <div className="space-y-1.5">
                {proSkillsAssignments.map((assignment) => {
                  const subRows = (assignment.pro_skills_submissions as unknown as { completed: boolean }[] | null) ?? [];
                  const completed = subRows[0]?.completed ?? false;
                  return (
                    <div key={assignment.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-slate-900">{assignment.title}</span>
                        {assignment.due_date && (
                          <span className="text-slate-400 ml-1.5">
                            Due {new Date(assignment.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                      {completed ? (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Done</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Not done</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

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
  accent?: "default" | "green" | "amber" | "blue" | "red";
}) {
  const subColor =
    accent === "green" ? "text-green-600" :
    accent === "amber" ? "text-amber-600" :
    accent === "blue"  ? "text-blue-600"  :
    accent === "red"   ? "text-red-500"   : "text-slate-400";

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>}
    </div>
  );
}

// ── Associate eligibility — 4-week period card ────────────────────────────────

type AssocTier = "eligible" | "minimum" | "ineligible" | null;

function AssocPeriodCard({
  label, period, tier, labsPct, attPct,
}: {
  label: string; period: string;
  tier: AssocTier; labsPct: number | null; attPct: number | null;
}) {
  const bg    = tier === "eligible"   ? "bg-green-50  border-green-200"
              : tier === "minimum"    ? "bg-amber-50  border-amber-200"
              : tier === "ineligible" ? "bg-red-50    border-red-200"
              :                         "bg-slate-50  border-slate-200";
  const badge = tier === "eligible"
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-green-100 text-green-700">Eligible</span>
    : tier === "minimum"
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-100 text-amber-700">Min. met</span>
    : tier === "ineligible"
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-100 text-red-600">Not eligible</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-500">Pending</span>;

  function pctColor(pct: number | null) {
    if (pct === null) return "text-slate-400";
    if (pct >= 80) return "text-green-600";
    if (pct >= 65) return "text-amber-600";
    return "text-red-500";
  }

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{period}</p>
        </div>
        <div className="shrink-0">{badge}</div>
      </div>
      <div className="space-y-1.5 mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">Labs</span>
          <span className={`font-medium ${pctColor(labsPct)}`}>
            {labsPct !== null ? `${Math.round(labsPct)}%` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">Attendance</span>
          <span className={`font-medium ${pctColor(attPct)}`}>
            {attPct !== null ? `${Math.round(attPct)}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function AssocStipendCard({ passed }: { passed: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-700 leading-tight">Exam Stipend</p>
        <div className="shrink-0">
          {passed
            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-green-100 text-green-700">Eligible</span>
            : <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-100 text-red-600">Not eligible</span>
          }
        </div>
      </div>
      <div className="flex items-center justify-between text-xs mt-3">
        <span className="text-slate-600">AWS exam passed</span>
        <span className={`font-medium ${passed ? "text-green-600" : "text-red-500"}`}>
          {passed ? "Yes" : "No"}
        </span>
      </div>
    </div>
  );
}
