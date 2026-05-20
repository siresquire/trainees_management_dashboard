import { createServiceClient } from "@/lib/supabase/server";
import AdminDashboardClient, { type AdminTraineeRow } from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const svc = createServiceClient();

  // ── Round 1: things that don't depend on each other ────────────────────────
  const { data: cohorts } = await svc
    .from("cohorts")
    .select("id, name, code_name, level, status")
    .eq("status", "active")
    .order("name");

  const cohortIds = (cohorts ?? []).map((c) => c.id);

  if (!cohortIds.length) {
    return <AdminDashboardClient rows={[]} poolCountPractitioner={0} poolCountAssociate={0} />;
  }

  // ── Round 2: all queries that only need cohortIds (fully parallel) ─────────
  const [
    { data: cohortAccess },
    { data: trainees },
    { data: tasks },
    { data: sessions },
    [{ count: poolCountPractitioner }, { count: poolCountAssociate }],
  ] = await Promise.all([
    svc.from("cohort_access").select("cohort_id, trainer_id").in("cohort_id", cohortIds).eq("role", "owner"),
    svc.from("trainees")
      .select("id, cohort_id, full_name, personal_email, amalitech_email, serial_no, status, exam_approved")
      .in("cohort_id", cohortIds)
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .order("serial_no", { ascending: true, nullsFirst: false }),
    svc.from("cohort_week_tasks").select("id, cohort_id, task_type").in("cohort_id", cohortIds),
    svc.from("sessions").select("id, cohort_id").in("cohort_id", cohortIds),
    Promise.all([
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "practitioner").eq("is_used", false),
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "associate").eq("is_used", false),
    ]),
  ]);

  // Derive IDs needed for round 3
  const ownerIdByCohort = new Map<string, string>(
    (cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id])
  );
  const ownerIds    = [...new Set((cohortAccess ?? []).map((a) => a.trainer_id))];
  const traineeIds  = (trainees ?? []).map((t) => t.id);
  const taskIds     = (tasks    ?? []).map((t) => t.id);
  const sessionIds  = (sessions ?? []).map((s) => s.id);

  // ── Round 3: everything that depends on round-2 IDs (fully parallel) ──────
  const [
    { data: profiles },
    { data: completions },
    { data: attendance },
    { data: vouchers },
  ] = await Promise.all([
    ownerIds.length
      ? svc.from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    taskIds.length && traineeIds.length
      ? svc.from("completions").select("trainee_id, task_id").in("trainee_id", traineeIds).in("task_id", taskIds).limit(200000)
      : Promise.resolve({ data: [] as { trainee_id: string; task_id: string }[] }),
    sessionIds.length && traineeIds.length
      ? svc.from("attendance").select("trainee_id").in("trainee_id", traineeIds).in("session_id", sessionIds).in("status", ["present", "partial"]).limit(200000)
      : Promise.resolve({ data: [] as { trainee_id: string }[] }),
    traineeIds.length
      ? svc.from("vouchers").select("trainee_id, voucher_code, attempt_no").in("trainee_id", traineeIds).order("attempt_no", { ascending: false })
      : Promise.resolve({ data: [] as { trainee_id: string; voucher_code: string | null; attempt_no: number }[] }),
  ]);

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const labTotalByCohort = new Map<string, number>();
  const kcTotalByCohort  = new Map<string, number>();
  const taskTypeMap      = new Map<string, string>();
  for (const t of tasks ?? []) {
    taskTypeMap.set(t.id, t.task_type);
    if (t.task_type === "lab") labTotalByCohort.set(t.cohort_id, (labTotalByCohort.get(t.cohort_id) ?? 0) + 1);
    if (t.task_type === "kc")  kcTotalByCohort.set(t.cohort_id,  (kcTotalByCohort.get(t.cohort_id)  ?? 0) + 1);
  }

  const sessionsByCohort = new Map<string, number>();
  for (const s of sessions ?? []) {
    sessionsByCohort.set(s.cohort_id, (sessionsByCohort.get(s.cohort_id) ?? 0) + 1);
  }

  const labDoneByTrainee = new Map<string, number>();
  const kcDoneByTrainee  = new Map<string, number>();
  for (const c of completions ?? []) {
    const type = taskTypeMap.get(c.task_id);
    if (type === "lab") labDoneByTrainee.set(c.trainee_id, (labDoneByTrainee.get(c.trainee_id) ?? 0) + 1);
    if (type === "kc")  kcDoneByTrainee.set(c.trainee_id,  (kcDoneByTrainee.get(c.trainee_id)  ?? 0) + 1);
  }

  const attendedByTrainee = new Map<string, number>();
  for (const a of attendance ?? []) {
    attendedByTrainee.set(a.trainee_id, (attendedByTrainee.get(a.trainee_id) ?? 0) + 1);
  }

  const voucherByTrainee = new Map<string, string | null>();
  for (const v of vouchers ?? []) {
    if (!voucherByTrainee.has(v.trainee_id)) voucherByTrainee.set(v.trainee_id, v.voucher_code ?? null);
  }

  const cohortMap = new Map((cohorts ?? []).map((c) => [c.id, c]));

  const rows: AdminTraineeRow[] = (trainees ?? []).map((t) => {
    const cohort  = cohortMap.get(t.cohort_id);
    const ownerId = ownerIdByCohort.get(t.cohort_id);
    return {
      traineeId:        t.id,
      serialNo:         t.serial_no,
      fullName:         t.full_name,
      personalEmail:    t.personal_email,
      amalitechEmail:   t.amalitech_email,
      status:           t.status,
      examApproved:     t.exam_approved ?? false,
      labsDone:         labDoneByTrainee.get(t.id) ?? 0,
      labsTotal:        labTotalByCohort.get(t.cohort_id) ?? 0,
      kcsDone:          kcDoneByTrainee.get(t.id) ?? 0,
      kcsTotal:         kcTotalByCohort.get(t.cohort_id) ?? 0,
      sessionsAttended: attendedByTrainee.get(t.id) ?? 0,
      sessionsTotal:    sessionsByCohort.get(t.cohort_id) ?? 0,
      cohortId:         t.cohort_id,
      cohortCode:       cohort?.code_name ?? cohort?.name ?? "—",
      cohortLevel:      cohort?.level ?? "practitioner",
      trainerName:      ownerId ? (profileNameById.get(ownerId) ?? "—") : "—",
      issuedVoucher:    voucherByTrainee.get(t.id) ?? null,
    };
  });

  rows.sort((a, b) => {
    const t = a.trainerName.localeCompare(b.trainerName);
    if (t !== 0) return t;
    const c = a.cohortCode.localeCompare(b.cohortCode);
    if (c !== 0) return c;
    return (a.serialNo ?? 9999) - (b.serialNo ?? 9999);
  });

  return (
    <AdminDashboardClient
      rows={rows}
      poolCountPractitioner={poolCountPractitioner ?? 0}
      poolCountAssociate={poolCountAssociate ?? 0}
    />
  );
}
