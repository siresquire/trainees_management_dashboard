import { createServiceClient } from "@/lib/supabase/server";
import AdminOverviewClient from "./AdminOverviewClient";

export type OverviewCohort = {
  id:        string;
  name:      string;
  codeName:  string;
  level:     string;
  trainerName: string;
  totalTrainees: number;
  labsDoneTotal: number;
  labsTotal:     number;
  kcsDoneTotal:  number;
  kcsTotal:      number;
  sessionsAttended: number;
  sessionsTotal: number;
  vouchersIssued: number;
  examPassed:    number;
  examFailed:    number;
};

export default async function AdminOverviewPage() {
  const svc = createServiceClient();

  const [
    { data: cohorts },
    { data: cohortAccess },
    { data: profiles },
    { data: trainees },
    { data: tasks },
    { data: sessions },
    { data: vouchers },
    { data: outcomes },
  ] = await Promise.all([
    svc.from("cohorts").select("id, name, code_name, level").eq("status", "active").order("name"),
    svc.from("cohort_access").select("cohort_id, trainer_id").eq("role", "owner"),
    svc.from("profiles").select("id, full_name"),
    svc.from("trainees").select("id, cohort_id").is("deleted_at", null).in("status", ["active", "completed"]),
    svc.from("cohort_week_tasks").select("id, cohort_id, task_type"),
    svc.from("sessions").select("id, cohort_id"),
    svc.from("vouchers").select("trainee_id, cohort_id:trainees!inner(cohort_id)"),
    svc.from("exam_outcomes").select("trainee_id, outcome, cohort_id:trainees!inner(cohort_id)"),
  ]);

  const cohortIds = (cohorts ?? []).map((c) => c.id);

  // RPC-based completion + attendance (bypass row limits)
  const [{ data: completionRows }, { data: attendanceRows }] = await Promise.all([
    cohortIds.length
      ? svc.rpc("get_admin_completion_summary", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { trainee_id: string; cohort_id: string; week_number: number; lab_count: number; kc_count: number }[] }),
    cohortIds.length
      ? svc.rpc("get_admin_attendance_summary", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { trainee_id: string; cohort_id: string; week_number: number | null; attended_count: number }[] }),
  ]);

  // Aggregate per cohort
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const ownerByCohort = new Map((cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id]));
  const traineesByCohort = new Map<string, number>();
  for (const t of trainees ?? []) traineesByCohort.set(t.cohort_id, (traineesByCohort.get(t.cohort_id) ?? 0) + 1);

  const labsTasksByCohort = new Map<string, number>();
  const kcsTasksByCohort  = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.task_type === "lab") labsTasksByCohort.set(t.cohort_id, (labsTasksByCohort.get(t.cohort_id) ?? 0) + 1);
    if (t.task_type === "kc")  kcsTasksByCohort.set(t.cohort_id,  (kcsTasksByCohort.get(t.cohort_id)  ?? 0) + 1);
  }
  const sessionsByCohort = new Map<string, number>();
  for (const s of sessions ?? []) sessionsByCohort.set(s.cohort_id, (sessionsByCohort.get(s.cohort_id) ?? 0) + 1);

  // Completion per cohort (sum over all trainees + weeks)
  const labsDoneByCohort = new Map<string, number>();
  const kcsDoneByCohort  = new Map<string, number>();
  for (const row of completionRows ?? []) {
    const cid = String(row.cohort_id);
    labsDoneByCohort.set(cid, (labsDoneByCohort.get(cid) ?? 0) + Number(row.lab_count));
    kcsDoneByCohort.set(cid,  (kcsDoneByCohort.get(cid)  ?? 0) + Number(row.kc_count));
  }

  // Attendance per cohort
  const attendanceDoneByCohort = new Map<string, number>();
  for (const row of attendanceRows ?? []) {
    const cid = String(row.cohort_id);
    attendanceDoneByCohort.set(cid, (attendanceDoneByCohort.get(cid) ?? 0) + Number(row.attended_count));
  }

  // Vouchers and outcomes per cohort
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

  const overviewCohorts: OverviewCohort[] = (cohorts ?? []).map((c) => {
    const ownerId    = ownerByCohort.get(c.id);
    const total      = traineesByCohort.get(c.id) ?? 0;
    const labsTotal  = labsTasksByCohort.get(c.id) ?? 0;
    const kcsTotal   = kcsTasksByCohort.get(c.id)  ?? 0;
    const sesTotal   = sessionsByCohort.get(c.id)  ?? 0;
    return {
      id:               c.id,
      name:             c.name,
      codeName:         c.code_name ?? c.name,
      level:            c.level ?? "practitioner",
      trainerName:      ownerId ? (profileById.get(ownerId) ?? "—") : "—",
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

  return <AdminOverviewClient cohorts={overviewCohorts} />;
}
