import { createServiceClient } from "@/lib/supabase/server";
import AdminExamsClient from "./AdminExamsClient";

export type ExamScheduleRow = {
  id:                  string;
  traineeId:           string;
  traineeSerialNo:     number | null;
  traineeName:         string;
  cohortId:            string;
  cohortCode:          string;
  cohortLevel:         string;
  trainerName:         string;
  firstName:           string;
  lastName:            string;
  otherNames:          string | null;
  personalEmail:       string;
  cohortDisplayName:   string;
  region:              string;
  awsAccountId:        string | null;
  awsCertEmail:        string | null;
  canvasGradStatus:    string;
  batchNumber:         number | null;
  voucherIssued:       boolean;
  voucherIssuedAt:     string | null;
  submittedAt:         string;
  certScore:           number | null;
  certOutcome:         string | null;
  passingScore:        number;
};

export default async function AdminExamsPage() {
  const svc = createServiceClient();

  // Load active cohorts, settings (for passing scores), and exam schedules in parallel
  const [
    { data: cohorts },
    { data: settings },
    { data: schedules },
  ] = await Promise.all([
    svc.from("cohorts").select("id, name, code_name, level, status").eq("status", "active").order("name"),
    svc.from("admin_settings").select("level, exam_passing_score"),
    svc.from("exam_schedules").select("id, trainee_id, cohort_id, first_name, last_name, other_names, personal_email, cohort_display_name, region, aws_account_id, aws_cert_email, canvas_grad_status, batch_number, voucher_issued, voucher_issued_at, submitted_at"),
  ]);

  if (!schedules?.length) {
    return (
      <AdminExamsClient
        rows={[]}
        cohorts={(cohorts ?? []).map((c) => ({ id: c.id, name: c.name as string, code_name: (c.code_name as string | null) ?? c.name as string, level: c.level as string }))}
      />
    );
  }

  const traineeIds = [...new Set((schedules ?? []).map((s) => s.trainee_id))];
  const cohortIds  = [...new Set((schedules ?? []).map((s) => s.cohort_id))];

  const [
    { data: trainees },
    { data: cohortAccess },
    { data: profiles },
    { data: outcomes },
  ] = await Promise.all([
    traineeIds.length
      ? svc.from("trainees").select("id, serial_no, full_name").in("id", traineeIds)
      : Promise.resolve({ data: [] as { id: string; serial_no: number | null; full_name: string }[] }),
    cohortIds.length
      ? svc.from("cohort_access").select("cohort_id, trainer_id").in("cohort_id", cohortIds).eq("role", "owner")
      : Promise.resolve({ data: [] as { cohort_id: string; trainer_id: string }[] }),
    svc.from("profiles").select("id, full_name"),
    traineeIds.length
      ? svc.from("exam_outcomes").select("trainee_id, actual_score, outcome, attempt_no").in("trainee_id", traineeIds).eq("attempt_no", 1).in("outcome", ["passed", "failed"])
      : Promise.resolve({ data: [] as { trainee_id: string; actual_score: number | null; outcome: string; attempt_no: number }[] }),
  ]);

  const traineeMap   = new Map((trainees ?? []).map((t) => [t.id, t]));
  const cohortMap    = new Map((cohorts ?? []).map((c) => [c.id, c]));
  const profileMap   = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const ownerByCohort = new Map((cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id]));
  const outcomeMap   = new Map((outcomes ?? []).map((o) => [o.trainee_id, o]));

  const passingScoreMap = new Map<string, number>(
    (settings ?? []).map((s) => [s.level as string, Number((s as Record<string, unknown>).exam_passing_score ?? 700)])
  );

  const rows: ExamScheduleRow[] = (schedules ?? []).map((s) => {
    const trainee = traineeMap.get(s.trainee_id);
    const cohort  = cohortMap.get(s.cohort_id);
    const ownerId = ownerByCohort.get(s.cohort_id);
    const outcome = outcomeMap.get(s.trainee_id);
    const level   = cohort?.level as string ?? "practitioner";

    return {
      id:                s.id,
      traineeId:         s.trainee_id,
      traineeSerialNo:   trainee?.serial_no ?? null,
      traineeName:       trainee?.full_name as string ?? "Unknown",
      cohortId:          s.cohort_id,
      cohortCode:        (cohort?.code_name as string | null) ?? cohort?.name as string ?? "—",
      cohortLevel:       level,
      trainerName:       ownerId ? (profileMap.get(ownerId) ?? "—") : "—",
      firstName:         s.first_name as string,
      lastName:          s.last_name as string,
      otherNames:        (s.other_names as string | null) ?? null,
      personalEmail:     s.personal_email as string,
      cohortDisplayName: s.cohort_display_name as string,
      region:            s.region as string,
      awsAccountId:      (s.aws_account_id as string | null) ?? null,
      awsCertEmail:      (s.aws_cert_email as string | null) ?? null,
      canvasGradStatus:  s.canvas_grad_status as string,
      batchNumber:       (s.batch_number as number | null) ?? null,
      voucherIssued:     s.voucher_issued as boolean,
      voucherIssuedAt:   (s.voucher_issued_at as string | null) ?? null,
      submittedAt:       s.submitted_at as string,
      certScore:         outcome?.actual_score ?? null,
      certOutcome:       outcome?.outcome ?? null,
      passingScore:      passingScoreMap.get(level) ?? 700,
    };
  });

  rows.sort((a, b) => {
    const c = a.cohortCode.localeCompare(b.cohortCode);
    if (c !== 0) return c;
    const bn = (a.batchNumber ?? 9999) - (b.batchNumber ?? 9999);
    if (bn !== 0) return bn;
    return (a.traineeSerialNo ?? 9999) - (b.traineeSerialNo ?? 9999);
  });

  return (
    <AdminExamsClient
      rows={rows}
      cohorts={(cohorts ?? []).map((c) => ({ id: c.id, name: c.name as string, code_name: (c.code_name as string | null) ?? c.name as string, level: c.level as string }))}
    />
  );
}
