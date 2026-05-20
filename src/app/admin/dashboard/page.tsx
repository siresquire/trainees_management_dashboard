import { createServiceClient } from "@/lib/supabase/server";
import AdminDashboardClient, { type AdminTraineeRow } from "./AdminDashboardClient";

export type SessionInfo = { id: string; cohortId: string; weekNumber: number };
export type TaskInfo    = { id: string; cohortId: string; taskType: string; weekNumber: number };
export type QuizInfo    = { id: string; cohortId: string; quizName: string; weekNumber: number; maxScore: number };

export default async function AdminDashboardPage() {
  const svc = createServiceClient();

  // ── Round 1: active cohorts ────────────────────────────────────────────────
  const { data: cohorts } = await svc
    .from("cohorts")
    .select("id, name, code_name, level, status")
    .eq("status", "active")
    .order("name");

  const cohortIds = (cohorts ?? []).map((c) => c.id);

  if (!cohortIds.length) {
    return (
      <AdminDashboardClient
        rows={[]} poolCountPractitioner={0} poolCountAssociate={0}
        allSessions={[]} allTasks={[]} allQuizzes={[]}
      />
    );
  }

  // ── Round 2: all queries that only need cohortIds ──────────────────────────
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
    svc.from("cohort_week_tasks").select("id, cohort_id, task_type, week_number").in("cohort_id", cohortIds),
    svc.from("sessions").select("id, cohort_id, week_number").in("cohort_id", cohortIds),
    Promise.all([
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "practitioner").eq("is_used", false),
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "associate").eq("is_used", false),
    ]),
  ]);

  const ownerIdByCohort = new Map<string, string>((cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id]));
  const ownerIds   = [...new Set((cohortAccess ?? []).map((a) => a.trainer_id))];
  const traineeIds = (trainees ?? []).map((t) => t.id);
  const taskIds    = (tasks    ?? []).map((t) => t.id);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  // ── Round 3: trainee-level data — all in parallel ─────────────────────────
  const [
    { data: profiles },
    { data: completions },
    { data: attendance },
    { data: overrides },
    { data: vouchers },
    { data: examQuizzes },
    { data: examScores },
  ] = await Promise.all([
    ownerIds.length
      ? svc.from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    taskIds.length && traineeIds.length
      ? svc.from("completions").select("trainee_id, task_id").in("trainee_id", traineeIds).in("task_id", taskIds).limit(1000000)
      : Promise.resolve({ data: [] as { trainee_id: string; task_id: string }[] }),
    sessionIds.length && traineeIds.length
      ? svc.from("attendance").select("trainee_id, session_id").in("trainee_id", traineeIds).in("session_id", sessionIds).in("status", ["present", "partial"]).limit(500000)
      : Promise.resolve({ data: [] as { trainee_id: string; session_id: string }[] }),
    sessionIds.length && traineeIds.length
      ? svc.from("attendance_overrides").select("trainee_id, session_id").in("session_id", sessionIds).in("trainee_id", traineeIds)
      : Promise.resolve({ data: [] as { trainee_id: string; session_id: string }[] }),
    traineeIds.length
      ? svc.from("vouchers").select("trainee_id, voucher_code, attempt_no").in("trainee_id", traineeIds).order("attempt_no", { ascending: false })
      : Promise.resolve({ data: [] as { trainee_id: string; voucher_code: string | null; attempt_no: number }[] }),
    cohortIds.length
      ? svc.from("exam_quizzes").select("id, cohort_id, quiz_name, week_number, max_score").in("cohort_id", cohortIds).order("week_number", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; cohort_id: string; quiz_name: string; week_number: number; max_score: number }[] }),
    traineeIds.length
      ? svc.from("exam_scores").select("trainee_id, quiz_id, score").in("trainee_id", traineeIds).limit(500000)
      : Promise.resolve({ data: [] as { trainee_id: string; quiz_id: string; score: number }[] }),
  ]);

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // Task lookups — use Sets for per-trainee tracking to deduplicate
  const taskTypeMap      = new Map<string, string>();
  const labTotalByCohort = new Map<string, number>();
  const kcTotalByCohort  = new Map<string, number>();
  for (const t of tasks ?? []) {
    taskTypeMap.set(t.id, t.task_type);
    if (t.task_type === "lab") labTotalByCohort.set(t.cohort_id, (labTotalByCohort.get(t.cohort_id) ?? 0) + 1);
    if (t.task_type === "kc")  kcTotalByCohort.set(t.cohort_id,  (kcTotalByCohort.get(t.cohort_id)  ?? 0) + 1);
  }

  const sessionsByCohort = new Map<string, number>();
  for (const s of sessions ?? []) {
    sessionsByCohort.set(s.cohort_id, (sessionsByCohort.get(s.cohort_id) ?? 0) + 1);
  }

  // Per-trainee Sets (deduplication is automatic)
  const completedLabsByTrainee = new Map<string, Set<string>>();
  const completedKcsByTrainee  = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    const type = taskTypeMap.get(c.task_id);
    if (type === "lab") {
      const s = completedLabsByTrainee.get(c.trainee_id) ?? new Set<string>();
      s.add(c.task_id);
      completedLabsByTrainee.set(c.trainee_id, s);
    } else if (type === "kc") {
      const s = completedKcsByTrainee.get(c.trainee_id) ?? new Set<string>();
      s.add(c.task_id);
      completedKcsByTrainee.set(c.trainee_id, s);
    }
  }

  // Attended session IDs per trainee: present/partial + excused overrides
  const attendedSessionsByTrainee = new Map<string, Set<string>>();
  for (const a of attendance ?? []) {
    const s = attendedSessionsByTrainee.get(a.trainee_id) ?? new Set<string>();
    s.add(a.session_id);
    attendedSessionsByTrainee.set(a.trainee_id, s);
  }
  for (const o of overrides ?? []) {
    const s = attendedSessionsByTrainee.get(o.trainee_id) ?? new Set<string>();
    s.add(o.session_id);
    attendedSessionsByTrainee.set(o.trainee_id, s);
  }

  const voucherByTrainee = new Map<string, string | null>();
  for (const v of vouchers ?? []) {
    if (!voucherByTrainee.has(v.trainee_id)) voucherByTrainee.set(v.trainee_id, v.voucher_code ?? null);
  }

  // Best quiz score per trainee per quiz
  const bestQuizScore = new Map<string, number>(); // `${traineeId}:${quizId}`
  for (const s of examScores ?? []) {
    const key  = `${s.trainee_id}:${s.quiz_id}`;
    const prev = bestQuizScore.get(key);
    if (prev === undefined || s.score > prev) bestQuizScore.set(key, s.score);
  }

  // Quiz list per cohort (ordered by week)
  const quizzesByCohort = new Map<string, { id: string; quiz_name: string; week_number: number; max_score: number }[]>();
  for (const q of examQuizzes ?? []) {
    const arr = quizzesByCohort.get(q.cohort_id) ?? [];
    arr.push(q);
    quizzesByCohort.set(q.cohort_id, arr);
  }

  const cohortMap = new Map((cohorts ?? []).map((c) => [c.id, c]));

  // ── Build rows ─────────────────────────────────────────────────────────────
  const rows: AdminTraineeRow[] = (trainees ?? []).map((t) => {
    const cohort           = cohortMap.get(t.cohort_id);
    const ownerId          = ownerIdByCohort.get(t.cohort_id);
    const completedLabs    = completedLabsByTrainee.get(t.id) ?? new Set<string>();
    const completedKcs     = completedKcsByTrainee.get(t.id)  ?? new Set<string>();
    const attendedSessions = attendedSessionsByTrainee.get(t.id) ?? new Set<string>();
    const cohortQuizzes    = quizzesByCohort.get(t.cohort_id) ?? [];

    return {
      traineeId:          t.id,
      serialNo:           t.serial_no,
      fullName:           t.full_name,
      personalEmail:      t.personal_email,
      amalitechEmail:     t.amalitech_email,
      status:             t.status,
      examApproved:       t.exam_approved ?? false,
      labsDone:           completedLabs.size,
      labsTotal:          labTotalByCohort.get(t.cohort_id) ?? 0,
      kcsDone:            completedKcs.size,
      kcsTotal:           kcTotalByCohort.get(t.cohort_id) ?? 0,
      sessionsAttended:   attendedSessions.size,
      sessionsTotal:      sessionsByCohort.get(t.cohort_id) ?? 0,
      cohortId:           t.cohort_id,
      cohortCode:         cohort?.code_name ?? cohort?.name ?? "—",
      cohortLevel:        cohort?.level ?? "practitioner",
      trainerName:        ownerId ? (profileNameById.get(ownerId) ?? "—") : "—",
      issuedVoucher:      voucherByTrainee.get(t.id) ?? null,
      attendedSessionIds: [...attendedSessions],
      completedLabIds:    [...completedLabs],
      completedKcIds:     [...completedKcs],
      quizScores:         cohortQuizzes
        .map((q) => ({ quizId: q.id, score: bestQuizScore.get(`${t.id}:${q.id}`) ?? null }))
        .filter((qs): qs is { quizId: string; score: number } => qs.score !== null),
    };
  });

  rows.sort((a, b) => {
    const t = a.trainerName.localeCompare(b.trainerName);
    if (t !== 0) return t;
    const c = a.cohortCode.localeCompare(b.cohortCode);
    if (c !== 0) return c;
    return (a.serialNo ?? 9999) - (b.serialNo ?? 9999);
  });

  const allSessions: SessionInfo[] = (sessions ?? [])
    .filter((s): s is typeof s & { week_number: number } => s.week_number !== null)
    .map((s) => ({ id: s.id, cohortId: s.cohort_id, weekNumber: s.week_number }));

  const allTasks: TaskInfo[] = (tasks ?? []).map((t) => ({
    id: t.id,
    cohortId: t.cohort_id,
    taskType: t.task_type,
    weekNumber: t.week_number,
  }));

  const allQuizzes: QuizInfo[] = (examQuizzes ?? []).map((q) => ({
    id: q.id,
    cohortId: q.cohort_id,
    quizName: q.quiz_name,
    weekNumber: q.week_number,
    maxScore: q.max_score,
  }));

  return (
    <AdminDashboardClient
      rows={rows}
      poolCountPractitioner={poolCountPractitioner ?? 0}
      poolCountAssociate={poolCountAssociate ?? 0}
      allSessions={allSessions}
      allTasks={allTasks}
      allQuizzes={allQuizzes}
    />
  );
}
