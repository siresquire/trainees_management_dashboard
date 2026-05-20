import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TrainerOverviewClient from "./TrainerOverviewClient";

export type TrainerOverviewCohort = {
  id:              string;
  name:            string;
  codeName:        string;
  level:           string;
  totalTrainees:   number;
  labsDoneTotal:   number;
  labsTotal:       number;
  kcsDoneTotal:    number;
  kcsTotal:        number;
  sessionsAttended: number;
  sessionsTotal:   number;
  vouchersIssued:  number;
  examPassed:      number;
  examFailed:      number;
};

export type TraineeSummary = {
  id:         string;
  name:       string;
  labPct:     number;
  kcPct:      number;
  attendPct:  number;
};

export default async function TrainerOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  const svc = createServiceClient();

  // Resolve which cohort IDs this trainer can see
  let accessibleCohortIds: string[] = [];
  if (isSuperAdmin) {
    const { data: allCohorts } = await svc
      .from("cohorts")
      .select("id")
      .eq("status", "active");
    accessibleCohortIds = (allCohorts ?? []).map((c) => c.id);
  } else {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("cohort_id")
      .eq("trainer_id", user.id);
    accessibleCohortIds = (access ?? []).map((a) => a.cohort_id);
  }

  if (!accessibleCohortIds.length) {
    return <TrainerOverviewClient cohorts={[]} traineesByCohort={{}} />;
  }

  // Phase 1 — parallel fetches that don't depend on each other
  const [
    { data: cohorts },
    { data: tasks },
    { data: sessions },
    { data: traineesData },
  ] = await Promise.all([
    svc.from("cohorts").select("id, name, code_name, level")
      .in("id", accessibleCohortIds)
      .eq("status", "active")
      .order("name"),
    svc.from("cohort_week_tasks").select("id, cohort_id, task_type")
      .in("cohort_id", accessibleCohortIds),
    svc.from("sessions").select("id, cohort_id")
      .in("cohort_id", accessibleCohortIds),
    svc.from("trainees").select("id, cohort_id, full_name")
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .in("cohort_id", accessibleCohortIds),
  ]);

  const activeCohortIds = (cohorts ?? []).map((c) => c.id);
  const traineeIds = (traineesData ?? []).map((t) => t.id);

  // Phase 2 — depends on traineeIds + cohortIds
  const [
    { data: vouchers },
    { data: outcomes },
    { data: completionRows },
    { data: attendanceRows },
  ] = await Promise.all([
    traineeIds.length
      ? svc.from("vouchers")
          .select("trainee_id, cohort_id:trainees!inner(cohort_id)")
          .in("trainee_id", traineeIds)
          .is("revoked_at", null)
      : Promise.resolve({ data: [] as Array<{ trainee_id: string; cohort_id: unknown }> }),
    traineeIds.length
      ? svc.from("exam_outcomes")
          .select("trainee_id, outcome, cohort_id:trainees!inner(cohort_id)")
          .in("trainee_id", traineeIds)
      : Promise.resolve({ data: [] as Array<{ trainee_id: string; outcome: string; cohort_id: unknown }> }),
    activeCohortIds.length
      ? svc.rpc("get_admin_completion_summary", { p_cohort_ids: activeCohortIds })
      : Promise.resolve({ data: [] as Array<{ trainee_id: string; cohort_id: string; week_number: number; lab_count: number; kc_count: number }> }),
    activeCohortIds.length
      ? svc.rpc("get_admin_attendance_summary", { p_cohort_ids: activeCohortIds })
      : Promise.resolve({ data: [] as Array<{ trainee_id: string; cohort_id: string; attended_count: number }> }),
  ]);

  // ── Build per-cohort aggregates ──────────────────────────────────────────

  const labsTasksByCohort = new Map<string, number>();
  const kcsTasksByCohort  = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.task_type === "lab") labsTasksByCohort.set(t.cohort_id, (labsTasksByCohort.get(t.cohort_id) ?? 0) + 1);
    if (t.task_type === "kc")  kcsTasksByCohort.set(t.cohort_id,  (kcsTasksByCohort.get(t.cohort_id)  ?? 0) + 1);
  }
  const sessionsByCohort = new Map<string, number>();
  for (const s of sessions ?? []) sessionsByCohort.set(s.cohort_id, (sessionsByCohort.get(s.cohort_id) ?? 0) + 1);

  const traineesByCohortCount = new Map<string, number>();
  for (const t of traineesData ?? []) traineesByCohortCount.set(t.cohort_id, (traineesByCohortCount.get(t.cohort_id) ?? 0) + 1);

  // Per-trainee completion totals (summed across weeks)
  const labByTrainee = new Map<string, { cohortId: string; lab: number; kc: number }>();
  for (const row of completionRows ?? []) {
    const cid = String(row.cohort_id);
    const tid = row.trainee_id;
    const curr = labByTrainee.get(tid) ?? { cohortId: cid, lab: 0, kc: 0 };
    labByTrainee.set(tid, { cohortId: cid, lab: curr.lab + Number(row.lab_count), kc: curr.kc + Number(row.kc_count) });
  }

  // Per-cohort totals (sum over all trainees)
  const labsDoneByCohort = new Map<string, number>();
  const kcsDoneByCohort  = new Map<string, number>();
  for (const [, v] of labByTrainee) {
    labsDoneByCohort.set(v.cohortId, (labsDoneByCohort.get(v.cohortId) ?? 0) + v.lab);
    kcsDoneByCohort.set(v.cohortId,  (kcsDoneByCohort.get(v.cohortId)  ?? 0) + v.kc);
  }

  // Per-trainee attendance
  const attendByTrainee = new Map<string, number>();
  for (const row of attendanceRows ?? []) {
    attendByTrainee.set(row.trainee_id, (attendByTrainee.get(row.trainee_id) ?? 0) + Number(row.attended_count));
  }

  const attendanceDoneByCohort = new Map<string, number>();
  for (const [tid, count] of attendByTrainee) {
    const t = traineesData?.find((x) => x.id === tid);
    if (t) attendanceDoneByCohort.set(t.cohort_id, (attendanceDoneByCohort.get(t.cohort_id) ?? 0) + count);
  }

  // Vouchers per cohort
  const vouchersByCohort = new Map<string, number>();
  for (const v of vouchers ?? []) {
    const cid = (v as unknown as { cohort_id: { cohort_id: string } }).cohort_id?.cohort_id;
    if (cid) vouchersByCohort.set(cid, (vouchersByCohort.get(cid) ?? 0) + 1);
  }

  const passedByCohort = new Map<string, number>();
  const failedByCohort = new Map<string, number>();
  for (const o of outcomes ?? []) {
    const cid = (o as unknown as { cohort_id: { cohort_id: string } }).cohort_id?.cohort_id;
    if (!cid) continue;
    if (o.outcome === "passed") passedByCohort.set(cid, (passedByCohort.get(cid) ?? 0) + 1);
    if (o.outcome === "failed") failedByCohort.set(cid, (failedByCohort.get(cid) ?? 0) + 1);
  }

  const overviewCohorts: TrainerOverviewCohort[] = (cohorts ?? []).map((c) => {
    const total     = traineesByCohortCount.get(c.id) ?? 0;
    const labsTotal = labsTasksByCohort.get(c.id) ?? 0;
    const kcsTotal  = kcsTasksByCohort.get(c.id)  ?? 0;
    const sesTotal  = sessionsByCohort.get(c.id)  ?? 0;
    return {
      id:               c.id,
      name:             c.name,
      codeName:         c.code_name ?? c.name,
      level:            c.level ?? "practitioner",
      totalTrainees:    total,
      labsDoneTotal:    labsDoneByCohort.get(c.id) ?? 0,
      labsTotal:        labsTotal * total,
      kcsDoneTotal:     kcsDoneByCohort.get(c.id)  ?? 0,
      kcsTotal:         kcsTotal * total,
      sessionsAttended: attendanceDoneByCohort.get(c.id) ?? 0,
      sessionsTotal:    sesTotal * total,
      vouchersIssued:   vouchersByCohort.get(c.id) ?? 0,
      examPassed:       passedByCohort.get(c.id)   ?? 0,
      examFailed:       failedByCohort.get(c.id)   ?? 0,
    };
  });

  // ── Build per-cohort trainee summaries for the drilldown panel ────────────

  const traineesByCohort: Record<string, TraineeSummary[]> = {};
  for (const c of cohorts ?? []) {
    const labT = labsTasksByCohort.get(c.id) ?? 0;
    const kcT  = kcsTasksByCohort.get(c.id)  ?? 0;
    const sesT = sessionsByCohort.get(c.id)  ?? 0;

    const list = (traineesData ?? [])
      .filter((t) => t.cohort_id === c.id)
      .map((t) => {
        const prog    = labByTrainee.get(t.id);
        const labPct  = labT > 0 ? Math.round(((prog?.lab ?? 0) / labT) * 100) : 0;
        const kcPct   = kcT  > 0 ? Math.round(((prog?.kc  ?? 0) / kcT)  * 100) : 0;
        const attPct  = sesT > 0 ? Math.round(((attendByTrainee.get(t.id) ?? 0) / sesT) * 100) : 0;
        return { id: t.id, name: t.full_name, labPct, kcPct, attendPct: attPct };
      })
      .sort((a, b) => (b.labPct + b.kcPct) - (a.labPct + a.kcPct));

    traineesByCohort[c.id] = list;
  }

  return <TrainerOverviewClient cohorts={overviewCohorts} traineesByCohort={traineesByCohort} />;
}
