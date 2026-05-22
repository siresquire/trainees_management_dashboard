"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Trainee: upsert own exam schedule ─────────────────────────────────────────

export async function upsertExamSchedule(
  fd: FormData
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const traineeId = fd.get("trainee_id") as string;
  const cohortId  = fd.get("cohort_id")  as string;

  if (!traineeId || !cohortId) return { error: "Missing required fields." };

  // Confirm trainee belongs to this user
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, graduated")
    .eq("id", traineeId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!trainee) return { error: "Trainee not found." };
  if (!trainee.graduated) return { error: "You must be graduated to register for an exam." };

  const firstName     = (fd.get("first_name")         as string | null)?.trim();
  const lastName      = (fd.get("last_name")          as string | null)?.trim();
  const otherNames    = (fd.get("other_names")        as string | null)?.trim() || null;
  const personalEmail = (fd.get("personal_email")     as string | null)?.trim();
  const cohortDisplayName = (fd.get("cohort_display_name") as string | null)?.trim();
  const region        = (fd.get("region")             as string | null)?.trim();
  const awsAccountId  = (fd.get("aws_account_id")     as string | null)?.trim() || null;
  const awsCertEmail  = (fd.get("aws_cert_email")     as string | null)?.trim() || null;

  if (!firstName || !lastName || !personalEmail || !cohortDisplayName || !region) {
    return { error: "Please fill in all required fields." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("exam_schedules")
    .upsert(
      {
        trainee_id:          traineeId,
        cohort_id:           cohortId,
        first_name:          firstName,
        last_name:           lastName,
        other_names:         otherNames,
        personal_email:      personalEmail,
        cohort_display_name: cohortDisplayName,
        region,
        aws_account_id:      awsAccountId,
        aws_cert_email:      awsCertEmail,
        canvas_grad_status:  "Graduated",
        updated_at:          new Date().toISOString(),
      },
      { onConflict: "trainee_id" }
    );

  if (error) return { error: error.message };
  revalidatePath("/trainee/exams");
  return {};
}

// ── Trainer / Admin: update batch number for one row ─────────────────────────

export async function updateExamScheduleBatch(
  scheduleId: string,
  batchNumber: number | null,
  revalidate: string = "/trainer/cohorts",
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "";
  if (!["trainer", "admin", "super_admin"].includes(role)) {
    return { error: "Insufficient permissions." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("exam_schedules")
    .update({ batch_number: batchNumber, updated_at: new Date().toISOString() })
    .eq("id", scheduleId);

  if (error) return { error: error.message };
  revalidatePath(revalidate);
  return {};
}

// ── Admin: bulk-update batch number for multiple rows ────────────────────────

export async function bulkUpdateExamScheduleBatch(
  scheduleIds: string[],
  batchNumber: number,
): Promise<{ error?: string }> {
  if (!scheduleIds.length) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["admin", "super_admin"].includes(profile?.role ?? "")) {
    return { error: "Admin only." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("exam_schedules")
    .update({ batch_number: batchNumber, updated_at: new Date().toISOString() })
    .in("id", scheduleIds);

  if (error) return { error: error.message };
  revalidatePath("/admin/exams");
  return {};
}

// ── Admin: bulk-mark voucher_issued ──────────────────────────────────────────

export async function bulkMarkVoucherIssued(
  scheduleIds: string[],
  issued: boolean,
): Promise<{ error?: string }> {
  if (!scheduleIds.length) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, id")
    .eq("id", user.id)
    .single();

  if (!["admin", "super_admin"].includes(profile?.role ?? "")) {
    return { error: "Admin only." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("exam_schedules")
    .update({
      voucher_issued:    issued,
      voucher_issued_at: issued ? new Date().toISOString() : null,
      voucher_issued_by: issued ? profile!.id : null,
      updated_at:        new Date().toISOString(),
    })
    .in("id", scheduleIds);

  if (error) return { error: error.message };
  revalidatePath("/admin/exams");
  revalidatePath("/admin/dashboard");
  return {};
}
