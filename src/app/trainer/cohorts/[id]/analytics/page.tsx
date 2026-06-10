import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CohortAnalyticsClient from "./CohortAnalyticsClient";

export type TraineeAnalytic = {
  id:        string;
  name:      string;
  labDone:   number;
  kcDone:    number;
  videoDone: number;
  attended:  number;
  weekData:  Array<{ week: number; labDone: number; kcDone: number }>;
};

export type WeekTotals = {
  week:     number;
  labTotal: number;
  kcTotal:  number;
};

export type AtRiskEntry = {
  traineeId:    string;
  name:         string;
  currentWeek:  number;
  labsDone:     number;
  labsExpected: number;
  kcsDone:      number;
  kcsExpected:  number;
  attDone:      number;
  attTotal:     number;
};

export type CohortAnalyticsData = {
  cohortId:      string;
  cohortLevel:   string;
  totalSessions: number;
  labTotal:      number;
  kcTotal:       number;
  videoTotal:    number;
  trainees:      TraineeAnalytic[];
  weekTotals:    WeekTotals[];
  atRisk:        AtRiskEntry[];
};

export default async function CohortAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  type AtRiskRow = {
    trainee_id: string; full_name: string; current_week: number;
    labs_done: number; labs_expected: number;
    kcs_done: number; kcs_expected: number;
    att_done: number; att_total: number;
  };
  const [
    { data: cohort },
    { data: trainees },
    { data: tasks },
    { data: summaryRows },
    { data: attendanceSummaryRows },
    { data: weekBreakdownRows },
    { data: atRiskRows },
  ] = await Promise.all([
    supabase.from("cohorts").select("level").eq("id", id).single(),
    supabase
      .from("trainees")
      .select("id, full_name")
      .eq("cohort_id", id)
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .order("full_name"),
    supabase.from("cohort_week_tasks").select("id, task_type, week_number").eq("cohort_id", id),
    supabase.rpc("get_cohort_completion_summary", { p_cohort_id: id }),
    supabase.rpc("get_cohort_attendance_summary", { p_cohort_id: id }),
    supabase.rpc("get_cohort_completion_by_week",  { p_cohort_id: id }),
    // Same at-risk rule as the overview and the Slack report:
    // labs/KCs < 80% of work assigned through the current week, or att < 70%
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_admin_at_risk", { p_cohort_ids: [id] }) as Promise<{ data: AtRiskRow[] | null }>,
  ]);

  const isPractitioner = cohort?.level === "practitioner";

  // ── Task totals & per-week counts ─────────────────────────────────────────
  let labTotal = 0, kcTotal = 0, videoTotal = 0;
  const weekTaskMap = new Map<number, { lab: number; kc: number }>();

  for (const t of tasks ?? []) {
    if (t.task_type === "lab")                            labTotal++;
    else if (t.task_type === "kc")                        kcTotal++;
    else if (t.task_type === "video" && !isPractitioner)  videoTotal++;

    if (t.week_number != null) {
      const entry = weekTaskMap.get(t.week_number) ?? { lab: 0, kc: 0 };
      if (t.task_type === "lab") entry.lab++;
      else if (t.task_type === "kc") entry.kc++;
      weekTaskMap.set(t.week_number, entry);
    }
  }

  const weekTotals: WeekTotals[] = Array.from(weekTaskMap.entries())
    .map(([week, { lab, kc }]) => ({ week, labTotal: lab, kcTotal: kc }))
    .sort((a, b) => a.week - b.week);

  // ── Attendance ────────────────────────────────────────────────────────────
  const totalSessions = (attendanceSummaryRows ?? [])[0]?.total_sessions ?? 0;
  const attendMap = new Map<string, number>();
  for (const r of attendanceSummaryRows ?? []) {
    attendMap.set(r.trainee_id, r.sessions_attended);
  }

  // ── Completion summary (overall totals per trainee) ───────────────────────
  const summaryMap = new Map<string, { lab: number; kc: number; video: number }>();
  for (const r of summaryRows ?? []) {
    summaryMap.set(r.trainee_id, {
      lab:   r.lab_count   ?? 0,
      kc:    r.kc_count    ?? 0,
      video: isPractitioner ? 0 : (r.video_count ?? 0),
    });
  }

  // ── Per-trainee per-week breakdown ────────────────────────────────────────
  const weekMap = new Map<string, Array<{ week: number; labDone: number; kcDone: number }>>();
  for (const r of weekBreakdownRows ?? []) {
    const arr = weekMap.get(r.trainee_id) ?? [];
    arr.push({ week: r.week_number, labDone: r.lab_count, kcDone: r.kc_count });
    weekMap.set(r.trainee_id, arr);
  }

  const traineeAnalytics: TraineeAnalytic[] = (trainees ?? []).map((t) => {
    const s     = summaryMap.get(t.id) ?? { lab: 0, kc: 0, video: 0 };
    const weeks = (weekMap.get(t.id) ?? []).sort((a, b) => a.week - b.week);
    return {
      id:        t.id,
      name:      t.full_name,
      labDone:   s.lab,
      kcDone:    s.kc,
      videoDone: s.video,
      attended:  attendMap.get(t.id) ?? 0,
      weekData:  weeks,
    };
  });

  const data: CohortAnalyticsData = {
    cohortId:      id,
    cohortLevel:   cohort?.level ?? "practitioner",
    totalSessions,
    labTotal,
    kcTotal,
    videoTotal,
    trainees:      traineeAnalytics,
    weekTotals,
    atRisk: (atRiskRows ?? []).map((r) => ({
      traineeId:    r.trainee_id,
      name:         r.full_name,
      currentWeek:  Number(r.current_week),
      labsDone:     Number(r.labs_done),
      labsExpected: Number(r.labs_expected),
      kcsDone:      Number(r.kcs_done),
      kcsExpected:  Number(r.kcs_expected),
      attDone:      Number(r.att_done),
      attTotal:     Number(r.att_total),
    })),
  };

  return <CohortAnalyticsClient data={data} />;
}
