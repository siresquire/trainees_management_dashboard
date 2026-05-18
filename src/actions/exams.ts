"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";

type ExamType = "CCP" | "SAA-C03" | "DVA-C02" | "SAP-C02" | "DOP-C02";

// ── Create quiz ───────────────────────────────────────────────────────────────

const QuizSchema = z.object({
  name:       z.string().min(1, "Quiz name is required").max(200),
  focusType:  z.enum(["practitioner", "associate", "professional", "other"]),
  focusLabel: z.string().max(100).optional(),
  weekNumber: z.coerce.number().int().min(0).max(52),
  quizDate:   z.string().optional(),
  maxScore:   z.coerce.number().positive().default(100),
});

export async function createExamQuiz(cohortId: string, formData: FormData) {
  const parsed = QuizSchema.safeParse({
    name:       formData.get("name"),
    focusType:  formData.get("focusType"),
    focusLabel: formData.get("focusLabel") || undefined,
    weekNumber: formData.get("weekNumber"),
    quizDate:   formData.get("quizDate")   || undefined,
    maxScore:   formData.get("maxScore")   || 100,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const d = parsed.data;
  const { error } = await supabase.from("exam_quizzes").insert({
    cohort_id:       cohortId,
    quiz_name:       d.name,
    focus_type:      d.focusType,
    focus_label:     d.focusLabel ?? null,
    week_number:     d.weekNumber,
    quiz_date:       d.quizDate ?? null,
    max_score:       d.maxScore,
    source_platform: "external",
    created_by:      user.id,
  });

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}

// ── Delete quiz (cascades scores) ─────────────────────────────────────────────

export async function deleteExamQuiz(quizId: string, cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Delete child scores first (FK constraint)
  await supabase.from("exam_scores").delete().eq("quiz_id", quizId);
  const { error } = await supabase.from("exam_quizzes").delete().eq("id", quizId);
  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}

// ── Date normaliser ───────────────────────────────────────────────────────────
// Handles YYYY-MM-DD, DD/MM/YYYY, and MM/DD/YYYY. Falls back to today.
function normDateToISO(raw?: string): string {
  if (!raw) return new Date().toISOString();

  // YYYY-MM-DD (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + "T00:00:00Z");
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // DD/MM/YYYY  (most common non-ISO locale format)
  const dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Last resort — let JS try
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ── Upload CSV scores for a quiz ──────────────────────────────────────────────

export async function uploadExamScores(
  quizId:   string,
  cohortId: string,
  rows:     Array<{ email: string; score: number; date?: string }>,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Build email → trainee_id map for this cohort
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null);

  const traineeByEmail = new Map<string, string>();
  for (const t of trainees ?? []) {
    if (t.personal_email)  traineeByEmail.set(t.personal_email.toLowerCase().trim(),  t.id);
    if (t.amalitech_email) traineeByEmail.set(t.amalitech_email.toLowerCase().trim(), t.id);
  }

  const inserts: Array<{
    quiz_id: string; trainee_id: string; score: number;
    uploaded_at: string; attempt_no: number;
  }> = [];
  const errors: string[] = [];

  for (const row of rows) {
    const traineeId = traineeByEmail.get(row.email.toLowerCase().trim());
    if (!traineeId) { errors.push(`No match: ${row.email}`); continue; }
    inserts.push({
      quiz_id:     quizId,
      trainee_id:  traineeId,
      score:       row.score,
      uploaded_at: normDateToISO(row.date),
      attempt_no:  1, // will be corrected below
    });
  }

  if (!inserts.length) return { imported: 0, skipped: errors.length, errors };

  // Determine existing max attempt_no per trainee to increment correctly.
  // Also track within-batch count so multiple rows for the same trainee in
  // one upload each get a distinct, incrementing attempt_no.
  const { data: existing } = await supabase
    .from("exam_scores")
    .select("trainee_id, attempt_no")
    .eq("quiz_id", quizId)
    .in("trainee_id", inserts.map(i => i.trainee_id));

  const maxAttemptMap = new Map<string, number>();
  for (const e of existing ?? []) {
    const prev = maxAttemptMap.get(e.trainee_id) ?? 0;
    if (e.attempt_no > prev) maxAttemptMap.set(e.trainee_id, e.attempt_no);
  }

  // batchCount tracks how many rows for each trainee we've already assigned
  // in this batch so we don't collide within the same insert.
  const batchCount = new Map<string, number>();
  for (const ins of inserts) {
    const dbMax    = maxAttemptMap.get(ins.trainee_id) ?? 0;
    const inBatch  = batchCount.get(ins.trainee_id) ?? 0;
    ins.attempt_no = dbMax + inBatch + 1;
    batchCount.set(ins.trainee_id, inBatch + 1);
  }

  const { error } = await supabase.from("exam_scores").insert(inserts);
  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { imported: inserts.length, skipped: errors.length, errors };
}

// ── Upload voucher code pool ───────────────────────────────────────────────────
// Parses an xlsx/csv of { name, email, voucher_code } rows, matches trainees by
// email, and stores in voucher_pool (invisible to trainees until issued).

export async function uploadVoucherPool(cohortId: string, formData: FormData) {
  const file = formData.get("voucher_file") as File | null;
  if (!file || file.size === 0) return { error: "No file provided." };
  if (file.size > 5_000_000)    return { error: "File too large (max 5 MB)." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["trainer", "quiz_creator", "super_admin"].includes(profile?.role ?? ""))
    return { error: "Not authorised." };

  // Parse file
  let rows: Array<{ name: string; email: string; voucher_code: string }> = [];
  try {
    const buffer   = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    rows = jsonRows
      .map((r) => ({
        name: String(
          r["name"] ?? r["Name"] ?? r["NAME"] ?? ""
        ).trim(),
        email: String(
          r["email"] ?? r["Email"] ?? r["EMAIL"] ?? ""
        ).trim().toLowerCase(),
        voucher_code: String(
          r["voucher_code"] ?? r["Voucher_Code"] ?? r["voucher code"] ??
          r["Voucher Code"] ?? r["VOUCHER_CODE"] ?? ""
        ).trim(),
      }))
      .filter((r) => r.email && r.voucher_code);
  } catch {
    return { error: "Could not parse file. Please use the provided template." };
  }

  if (!rows.length)
    return { error: "No valid rows found. Ensure the file has email and voucher_code columns." };

  // Match emails to trainees in this cohort
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null);

  const traineeByEmail = new Map<string, string>();
  for (const t of trainees ?? []) {
    if (t.personal_email)  traineeByEmail.set(t.personal_email.toLowerCase().trim(),  t.id);
    if (t.amalitech_email) traineeByEmail.set(t.amalitech_email.toLowerCase().trim(), t.id);
  }

  // Replace unissued pool entries for this cohort
  await supabase
    .from("voucher_pool")
    .delete()
    .eq("cohort_id", cohortId)
    .eq("is_used", false);

  const inserts = rows.map((r) => ({
    cohort_id:    cohortId,
    trainee_id:   traineeByEmail.get(r.email) ?? null,
    email:        r.email,
    name:         r.name || null,
    voucher_code: r.voucher_code,
    uploaded_by:  user.id,
  }));

  const { error } = await supabase.from("voucher_pool").insert(inserts);
  if (error) return { error: error.message };

  const matched   = inserts.filter((i) => i.trainee_id !== null).length;
  const unmatched = inserts.length - matched;
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true, imported: inserts.length, matched, unmatched };
}

// ── Issue voucher ─────────────────────────────────────────────────────────────

export async function issueVoucher(
  traineeId:   string,
  cohortId:    string,
  examType:    string,
  voucherCode: string,
  poolId:      string | null,
) {
  if (!voucherCode.trim()) return { error: "Voucher code is required." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Next attempt number for this trainee + exam type
  const { data: existing } = await supabase
    .from("vouchers")
    .select("attempt_no")
    .eq("trainee_id", traineeId)
    .eq("exam_type", examType as "CCP" | "SAA-C03" | "DVA-C02" | "SAP-C02" | "DOP-C02")
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextAttempt = (existing?.attempt_no ?? 0) + 1;

  const { error } = await supabase.from("vouchers").insert({
    trainee_id:   traineeId,
    exam_type:    examType as ExamType,
    issued_date:  new Date().toISOString().split("T")[0],
    attempt_no:   nextAttempt,
    issued_by:    user.id,
    voucher_code: voucherCode.trim(),
  });

  if (error) return { error: error.message };

  // Mark pool entry as consumed so it won't pre-fill again
  if (poolId) {
    await supabase
      .from("voucher_pool")
      .update({ is_used: true })
      .eq("id", poolId);
  }

  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  revalidatePath("/trainee/exams");
  return { success: true };
}

// ── Revoke voucher ────────────────────────────────────────────────────────────

export async function revokeVoucher(voucherId: string, cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("vouchers").delete().eq("id", voucherId);
  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}

// ── Save official exam score ──────────────────────────────────────────────────

const OutcomeSchema = z.object({
  examType:  z.string().min(1),
  score:     z.coerce.number().int().min(100).max(1000),
  passed:    z.enum(["passed", "failed", "pending"]),
  examDate:  z.string().min(1, "Exam date is required"),
  attemptNo: z.coerce.number().int().min(1),
  notes:     z.string().max(500).optional(),
});

export async function saveOfficialScore(
  traineeId: string,
  cohortId:  string,
  formData:  FormData,
) {
  const parsed = OutcomeSchema.safeParse({
    examType:  formData.get("examType"),
    score:     formData.get("score"),
    passed:    formData.get("passed"),
    examDate:  formData.get("examDate"),
    attemptNo: formData.get("attemptNo"),
    notes:     formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const d = parsed.data;
  const { error } = await supabase.from("exam_outcomes").insert({
    trainee_id:   traineeId,
    exam_type:    d.examType as ExamType,
    actual_score: d.score,
    outcome:      d.passed,
    exam_date:    d.examDate,
    attempt_no:   d.attemptNo,
    notes:        d.notes ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}

// ── Delete official exam score ────────────────────────────────────────────────

export async function deleteOfficialScore(outcomeId: string, cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("exam_outcomes").delete().eq("id", outcomeId);
  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}

// ── Toggle readiness visibility per trainee ───────────────────────────────────

export async function toggleReadiness(
  traineeId: string,
  cohortId:  string,
  show:      boolean,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("trainees")
    .update({ show_readiness: show })
    .eq("id", traineeId);

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  revalidatePath("/trainee/exams");
  return { success: true };
}

// ── Trainer overwrites / edits an existing exam outcome ───────────────────────

const EditOutcomeSchema = z.object({
  examType:  z.string().min(1),
  score:     z.coerce.number().int().min(100).max(1000),
  passed:    z.enum(["passed", "failed", "pending"]),
  examDate:  z.string().min(1, "Exam date is required"),
  attemptNo: z.coerce.number().int().min(1),
  notes:     z.string().max(500).optional(),
});

export async function updateOfficialScore(
  outcomeId: string,
  cohortId:  string,
  formData:  FormData,
) {
  const parsed = EditOutcomeSchema.safeParse({
    examType:  formData.get("examType"),
    score:     formData.get("score"),
    passed:    formData.get("passed"),
    examDate:  formData.get("examDate"),
    attemptNo: formData.get("attemptNo"),
    notes:     formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const d = parsed.data;
  const { error } = await supabase
    .from("exam_outcomes")
    .update({
      exam_type:     d.examType as ExamType,
      actual_score:  d.score,
      outcome:       d.passed,
      exam_date:     d.examDate,
      attempt_no:    d.attemptNo,
      notes:         d.notes ?? null,
      self_reported: false, // trainer override clears self-reported flag
    })
    .eq("id", outcomeId);

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  revalidatePath("/trainee/exams");
  return { success: true };
}

// ── Trainee self-reports their own exam result ────────────────────────────────

const SelfReportSchema = z.object({
  examType:  z.string().min(1),
  score:     z.coerce.number().int().min(100).max(1000),
  passed:    z.enum(["passed", "failed", "pending"]),
  examDate:  z.string().min(1, "Exam date is required"),
  attemptNo: z.coerce.number().int().min(1).optional(),
  notes:     z.string().max(500).optional(),
});

export async function submitMyExamResult(formData: FormData) {
  const parsed = SelfReportSchema.safeParse({
    examType:  formData.get("examType"),
    score:     formData.get("score"),
    passed:    formData.get("passed"),
    examDate:  formData.get("examDate"),
    attemptNo: formData.get("attemptNo") || undefined,
    notes:     formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Verify trainee identity
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!trainee) return { error: "No active trainee record found." };

  const d = parsed.data;

  // Determine attempt number if not supplied
  let attemptNo = d.attemptNo;
  if (!attemptNo) {
    const { data: existing } = await supabase
      .from("exam_outcomes")
      .select("attempt_no")
      .eq("trainee_id", trainee.id)
      .eq("exam_type", d.examType as ExamType)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    attemptNo = (existing?.attempt_no ?? 0) + 1;
  }

  const { error } = await supabase.from("exam_outcomes").insert({
    trainee_id:    trainee.id,
    exam_type:     d.examType as ExamType,
    actual_score:  d.score,
    outcome:       d.passed,
    exam_date:     d.examDate,
    attempt_no:    attemptNo,
    notes:         d.notes ?? null,
    self_reported: true,
  });

  if (error) return { error: error.message };
  revalidatePath("/trainee/exams");
  return { success: true };
}

// ── Trainee deletes own self-reported result ──────────────────────────────────

export async function deleteMyExamResult(outcomeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // RLS policy already guards this — only self_reported rows the trainee owns
  const { error } = await supabase
    .from("exam_outcomes")
    .delete()
    .eq("id", outcomeId);

  if (error) return { error: error.message };
  revalidatePath("/trainee/exams");
  return { success: true };
}

// ── Upload exam scores from CSV or XLSX file ──────────────────────────────────
//
// Accepts both .csv and .xlsx uploads server-side so we don't need client-side
// file parsing (avoids BOM issues, quoted-field edge cases, and binary XLSX).

export async function uploadExamScoresFromFile(
  quizId:   string,
  cohortId: string,
  formData: FormData,
) {
  const file = formData.get("scores_file") as File | null;
  if (!file || file.size === 0) return { error: "No file provided." };
  if (file.size > 5_000_000) return { error: "File too large (max 5 MB)." };

  let rows: Array<{ email: string; score: number; date?: string }> = [];

  try {
    const buffer   = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw:    false, // stringify dates automatically
    });

    rows = jsonRows
      .map((r) => {
        const email = String(
          r["email"] ?? r["Email"] ?? r["EMAIL"] ?? ""
        ).trim();
        const scoreRaw = r["score"] ?? r["Score"] ?? r["SCORE"] ?? "";
        const score    = parseFloat(String(scoreRaw));
        const dateRaw  = String(
          r["date_taken"] ?? r["Date_Taken"] ?? r["date"] ?? r["Date"] ?? ""
        ).trim();
        return { email, score, date: dateRaw || undefined };
      })
      .filter((r) => r.email && !isNaN(r.score) && r.score >= 0);
  } catch {
    return { error: "Could not parse the file. Please use the provided template." };
  }

  if (!rows.length) {
    return { error: "No valid rows found. Check that the file has email and score columns." };
  }

  return uploadExamScores(quizId, cohortId, rows);
}
