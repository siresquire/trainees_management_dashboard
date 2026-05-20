import { createServiceClient } from "@/lib/supabase/server";
import AdminDashboardClient, { type AdminTraineeRow } from "./AdminDashboardClient";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level: levelParam } = await searchParams;
  const level: "practitioner" | "associate" =
    levelParam === "associate" ? "associate" : "practitioner";

  const svc = createServiceClient();

  // All active cohorts (all levels — we filter in client by level tab)
  const { data: cohorts } = await svc
    .from("cohorts")
    .select("id, name, code_name, level, status")
    .eq("status", "active")
    .order("name");

  const cohortIds = (cohorts ?? []).map((c) => c.id);

  if (!cohortIds.length) {
    return (
      <AdminDashboardClient
        level={level}
        rows={[]}
        poolCountPractitioner={0}
        poolCountAssociate={0}
      />
    );
  }

  // Owner trainer per cohort (role = 'owner' in cohort_access)
  const { data: cohortAccess } = await svc
    .from("cohort_access")
    .select("cohort_id, trainer_id, role")
    .in("cohort_id", cohortIds)
    .eq("role", "owner");

  const ownerIdByCohort = new Map<string, string>(
    (cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id])
  );
  const ownerIds = [...new Set(Object.values(Object.fromEntries(ownerIdByCohort)))];

  const { data: profiles } = ownerIds.length
    ? await svc.from("profiles").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // All active trainees across these cohorts
  const { data: trainees } = await svc
    .from("trainees")
    .select("id, cohort_id, full_name, personal_email, amalitech_email, serial_no, status, exam_approved")
    .in("cohort_id", cohortIds)
    .is("deleted_at", null)
    .in("status", ["active", "completed"])
    .order("serial_no", { ascending: true, nullsFirst: false });

  const traineeIds = (trainees ?? []).map((t) => t.id);

  // Task totals per cohort
  const { data: tasks } = cohortIds.length
    ? await svc
        .from("cohort_week_tasks")
        .select("id, cohort_id, task_type")
        .in("cohort_id", cohortIds)
    : { data: [] };

  const labTotalByCohort  = new Map<string, number>();
  const kcTotalByCohort   = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.task_type === "lab") labTotalByCohort.set(t.cohort_id, (labTotalByCohort.get(t.cohort_id) ?? 0) + 1);
    if (t.task_type === "kc")  kcTotalByCohort.set(t.cohort_id,  (kcTotalByCohort.get(t.cohort_id)  ?? 0) + 1);
  }

  // Completions (using RPC per cohort is expensive; do a direct count per trainee)
  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: completions } = taskIds.length && traineeIds.length
    ? await svc
        .from("completions")
        .select("trainee_id, task_id")
        .in("trainee_id", traineeIds)
        .in("task_id", taskIds)
        .limit(200000)
    : { data: [] };

  // Map trainee → completed task_ids
  const completedByTrainee = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    const s = completedByTrainee.get(c.trainee_id) ?? new Set<string>();
    s.add(c.task_id);
    completedByTrainee.set(c.trainee_id, s);
  }

  // Task id → cohort_id mapping for type lookup
  const taskCohortMap  = new Map<string, string>((tasks ?? []).map((t) => [t.id, t.cohort_id]));
  const taskTypeMap    = new Map<string, string>((tasks ?? []).map((t) => [t.id, t.task_type]));

  // Build per-trainee done counts using their cohort's task lists
  const labDoneByTrainee = new Map<string, number>();
  const kcDoneByTrainee  = new Map<string, number>();
  for (const [traineeId, completed] of completedByTrainee) {
    let labs = 0, kcs = 0;
    for (const taskId of completed) {
      const type = taskTypeMap.get(taskId);
      if (type === "lab") labs++;
      else if (type === "kc") kcs++;
    }
    labDoneByTrainee.set(traineeId, labs);
    kcDoneByTrainee.set(traineeId, kcs);
  }

  // Attendance: sessions per cohort, attendance per trainee
  const { data: sessions } = cohortIds.length
    ? await svc
        .from("sessions")
        .select("id, cohort_id")
        .in("cohort_id", cohortIds)
    : { data: [] };

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const sessionsByCohort = new Map<string, number>();
  for (const s of sessions ?? []) {
    sessionsByCohort.set(s.cohort_id, (sessionsByCohort.get(s.cohort_id) ?? 0) + 1);
  }

  const { data: attendance } = sessionIds.length && traineeIds.length
    ? await svc
        .from("attendance")
        .select("trainee_id, status")
        .in("trainee_id", traineeIds)
        .in("session_id", sessionIds)
        .in("status", ["present", "partial"])
    : { data: [] };

  const attendedByTrainee = new Map<string, number>();
  for (const a of attendance ?? []) {
    attendedByTrainee.set(a.trainee_id, (attendedByTrainee.get(a.trainee_id) ?? 0) + 1);
  }

  // Latest issued voucher code per trainee
  const { data: vouchers } = traineeIds.length
    ? await svc
        .from("vouchers")
        .select("trainee_id, voucher_code, attempt_no")
        .in("trainee_id", traineeIds)
        .order("attempt_no", { ascending: false })
    : { data: [] };

  const voucherByTrainee = new Map<string, string | null>();
  for (const v of vouchers ?? []) {
    if (!voucherByTrainee.has(v.trainee_id)) {
      voucherByTrainee.set(v.trainee_id, v.voucher_code ?? null);
    }
  }

  // Unissued voucher pool counts
  const [
    { count: poolCountPractitioner },
    { count: poolCountAssociate },
  ] = await Promise.all([
    svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "practitioner").eq("is_used", false),
    svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "associate").eq("is_used", false),
  ]);

  // Build cohort info map
  const cohortMap = new Map((cohorts ?? []).map((c) => [c.id, c]));

  // Assemble rows
  const rows: AdminTraineeRow[] = (trainees ?? []).map((t) => {
    const cohort     = cohortMap.get(t.cohort_id);
    const ownerId    = ownerIdByCohort.get(t.cohort_id);
    const labsTotal  = labTotalByCohort.get(t.cohort_id) ?? 0;
    const kcsTotal   = kcTotalByCohort.get(t.cohort_id)  ?? 0;
    const labsDone   = labDoneByTrainee.get(t.id) ?? 0;
    const kcsDone    = kcDoneByTrainee.get(t.id)  ?? 0;
    const sessTotal  = sessionsByCohort.get(t.cohort_id) ?? 0;
    const sessAtt    = attendedByTrainee.get(t.id) ?? 0;

    return {
      traineeId:        t.id,
      serialNo:         t.serial_no,
      fullName:         t.full_name,
      personalEmail:    t.personal_email,
      amalitechEmail:   t.amalitech_email,
      status:           t.status,
      examApproved:     t.exam_approved ?? false,
      labsDone,
      labsTotal,
      kcsDone,
      kcsTotal,
      sessionsAttended: sessAtt,
      sessionsTotal:    sessTotal,
      cohortId:         t.cohort_id,
      cohortCode:       cohort?.code_name ?? cohort?.name ?? "—",
      cohortLevel:      cohort?.level ?? "practitioner",
      trainerName:      ownerId ? (profileNameById.get(ownerId) ?? "—") : "—",
      issuedVoucher:    voucherByTrainee.get(t.id) ?? null,
    };
  });

  // Sort: trainerName → cohortCode → serialNo
  rows.sort((a, b) => {
    const byTrainer = a.trainerName.localeCompare(b.trainerName);
    if (byTrainer !== 0) return byTrainer;
    const byCohort = a.cohortCode.localeCompare(b.cohortCode);
    if (byCohort !== 0) return byCohort;
    return (a.serialNo ?? 9999) - (b.serialNo ?? 9999);
  });

  return (
    <AdminDashboardClient
      level={level}
      rows={rows}
      poolCountPractitioner={poolCountPractitioner ?? 0}
      poolCountAssociate={poolCountAssociate ?? 0}
    />
  );
}
