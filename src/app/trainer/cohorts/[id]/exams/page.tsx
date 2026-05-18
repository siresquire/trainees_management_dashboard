import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExamsClient from "./ExamsClient";

export default async function ExamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, exam_type")
    .eq("id", id)
    .single();

  // Active non-deleted trainees for this cohort
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, serial_no, full_name, personal_email, amalitech_email, show_readiness")
    .eq("cohort_id", id)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("serial_no", { ascending: true, nullsFirst: false });

  // Quizzes / tests for this cohort
  const { data: quizzes } = await supabase
    .from("exam_quizzes")
    .select("id, quiz_name, focus_type, focus_label, week_number, quiz_date, max_score, created_at")
    .eq("cohort_id", id)
    .order("created_at", { ascending: true });

  const traineeIds = (trainees ?? []).map((t) => t.id);
  const quizIds    = (quizzes  ?? []).map((q) => q.id);

  // All scores for these quizzes
  const { data: scores } = quizIds.length
    ? await supabase
        .from("exam_scores")
        .select("id, quiz_id, trainee_id, score, attempt_no, uploaded_at")
        .in("quiz_id", quizIds)
    : { data: [] };

  // Vouchers for trainees in this cohort
  const { data: vouchers } = traineeIds.length
    ? await supabase
        .from("vouchers")
        .select("id, trainee_id, exam_type, issued_date, attempt_no, voucher_code")
        .in("trainee_id", traineeIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  // Pre-uploaded (unissued) voucher codes for this cohort
  const { data: pooledVouchers } = traineeIds.length
    ? await supabase
        .from("voucher_pool")
        .select("id, trainee_id, voucher_code")
        .eq("cohort_id", id)
        .eq("is_used", false)
        .not("trainee_id", "is", null)
    : { data: [] };

  // Official exam outcomes for trainees in this cohort
  const { data: outcomes } = traineeIds.length
    ? await supabase
        .from("exam_outcomes")
        .select("id, trainee_id, exam_type, actual_score, outcome, exam_date, attempt_no, notes, self_reported")
        .in("trainee_id", traineeIds)
        .order("attempt_no", { ascending: true })
    : { data: [] };

  return (
    <ExamsClient
      cohortId={id}
      cohortLevel={cohort?.level ?? "practitioner"}
      cohortExamType={cohort?.exam_type ?? null}
      trainees={(trainees ?? []).map((t) => ({
        ...t,
        show_readiness: t.show_readiness ?? false,
      }))}
      quizzes={(quizzes ?? []).map((q) => ({
        ...q,
        focus_type:  (q.focus_type  as string) ?? "practitioner",
        focus_label: (q.focus_label as string | null) ?? null,
        max_score:   (q.max_score   as number) ?? 100,
      }))}
      scores={scores   ?? []}
      vouchers={vouchers ?? []}
      pooledVouchers={pooledVouchers ?? []}
      outcomes={outcomes ?? []}
    />
  );
}
