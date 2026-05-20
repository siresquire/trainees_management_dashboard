"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Trainee submits their exam appointment ────────────────────────────────

export async function submitExamAppointment(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const traineeId   = formData.get("trainee_id")   as string;
  const cohortId    = formData.get("cohort_id")     as string;
  const voucherId   = (formData.get("voucher_id") as string) || null;
  const examDate    = formData.get("exam_date")     as string;
  const examTime    = formData.get("exam_time")     as string;
  const examLocation = formData.get("exam_location") as string;

  if (!traineeId || !cohortId || !examDate || !examTime || !examLocation) {
    return { error: "All fields are required." };
  }

  // Verify the trainee belongs to the authenticated user
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id")
    .eq("id", traineeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!trainee) return { error: "Trainee record not found." };

  const svc = createServiceClient();

  // Validate exam date doesn't exceed voucher deadline
  if (voucherId) {
    const { data: voucher } = await svc
      .from("vouchers")
      .select("deadline")
      .eq("id", voucherId)
      .maybeSingle();
    if (voucher?.deadline && examDate > voucher.deadline.slice(0, 10)) {
      return { error: `Exam date cannot be after the voucher deadline (${voucher.deadline.slice(0, 10)}).` };
    }
  }

  // Upsert — replace any prior appointment for this trainee+voucher combo
  const { error } = await svc
    .from("exam_appointments")
    .upsert(
      { trainee_id: traineeId, cohort_id: cohortId, voucher_id: voucherId, exam_date: examDate, exam_time: examTime, exam_location: examLocation, submitted_at: new Date().toISOString() },
      { onConflict: "trainee_id,voucher_id", ignoreDuplicates: false }
    );

  if (error) {
    // If the unique constraint doesn't exist yet, fall back to insert
    const { error: insertErr } = await svc.from("exam_appointments").insert({
      trainee_id: traineeId, cohort_id: cohortId, voucher_id: voucherId,
      exam_date: examDate, exam_time: examTime, exam_location: examLocation,
    });
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath("/trainee/exams");
  return {};
}

// ── Load appointments for a cohort (trainer view) ─────────────────────────

export async function getCohortAppointments(cohortId: string): Promise<{
  data?: { traineeId: string; traineeName: string; examDate: string; examTime: string; examLocation: string; submittedAt: string }[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("exam_appointments")
    .select("trainee_id, exam_date, exam_time, exam_location, submitted_at, trainees!inner(full_name)")
    .eq("cohort_id", cohortId)
    .order("submitted_at", { ascending: false });

  if (error) return { error: error.message };

  return {
    data: (data ?? []).map((r) => ({
      traineeId:    r.trainee_id,
      traineeName:  (r.trainees as { full_name: string }).full_name,
      examDate:     r.exam_date as string,
      examTime:     r.exam_time as string,
      examLocation: r.exam_location as string,
      submittedAt:  r.submitted_at as string,
    })),
  };
}
