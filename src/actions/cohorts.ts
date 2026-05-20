"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

// ── Schemas ────────────────────────────────────────────────────────────────────

// Full schema: trainer / super_admin
const TrainerCohortSchema = z.object({
  name:                    z.string().min(1, "Name is required"),
  code_name:               z.string().optional(),
  level:                   z.enum(["practitioner", "associate", "devops"]),
  exam_type:               z.enum(["CCP", "SAA-C03", "DVA-C02", "SAP-C02", "DOP-C02"]).optional(),
  institution:             z.string().optional(),
  start_date:              z.string().min(1, "Start date is required"),
  training_weeks:          z.coerce.number().int().min(1).max(52),
  exam_prep_weeks:         z.coerce.number().int().min(0).max(6),
  attendance_present_pct:  z.coerce.number().int().min(1).max(100),
  attendance_partial_pct:  z.coerce.number().int().min(1).max(100),
  canvas_course_id:        z.string().optional(),
  has_index_numbers:       z.boolean().optional(),
  assigned_trainer_id:     z.string().uuid().optional(),
});

// Simplified schema: quiz_creator
const QcCohortSchema = z.object({
  name:              z.string().min(1, "Name is required"),
  institution:       z.string().min(1, "Institution / school name is required"),
  start_date:        z.string().min(1, "Start date is required"),
  end_date:          z.string().min(1, "End date is required"),
  has_index_numbers: z.boolean().optional(),
});

const PLATFORM_MAP: Record<string, "canvas" | "whizlabs" | "devops" | "general"> = {
  practitioner: "canvas",
  associate:    "whizlabs",
  devops:       "devops",
  general:      "general",
};

export type CohortFormState = {
  errors?: Record<string, string[]>;
  error?: string;
} | null;

export async function createCohort(
  _prev: CohortFormState,
  formData: FormData
): Promise<CohortFormState> {
  // Auth first — role determines which schema to use
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isQC = profile?.role === "quiz_creator";

  // ── Quiz Creator path ─────────────────────────────────────────────────────
  if (isQC) {
    const parsed = QcCohortSchema.safeParse({
      name:              formData.get("name"),
      institution:       formData.get("institution") || "",
      start_date:        formData.get("start_date"),
      end_date:          formData.get("end_date"),
      has_index_numbers: formData.get("has_index_numbers") === "1",
    });

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const d = parsed.data;

    // Compute training_weeks from date range
    const startMs  = new Date(d.start_date).getTime();
    const endMs    = new Date(d.end_date).getTime();
    if (endMs <= startMs) return { error: "End date must be after start date" };
    const training_weeks = Math.max(1, Math.ceil((endMs - startMs) / (7 * 24 * 60 * 60 * 1000)));

    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .insert({
        name:                   d.name,
        institution:            d.institution,
        level:                  "general",
        platform:               "general",
        start_date:             d.start_date,
        end_date:               d.end_date,
        training_weeks,
        exam_prep_weeks:        0,
        attendance_present_pct: 75,
        attendance_partial_pct: 50,
        has_index_numbers:      d.has_index_numbers ?? false,
        created_by:             user.id,
      })
      .select("id")
      .single();

    if (cohortError) return { error: cohortError.message };

    await supabase.from("cohort_access").insert({
      cohort_id:   cohort.id,
      trainer_id:  user.id,
      role:        "owner",
      accepted_at: new Date().toISOString(),
    });

    redirect(`/trainer/cohorts/${cohort.id}`);
  }

  // ── Trainer / Super Admin path ────────────────────────────────────────────
  const raw = {
    name:                   formData.get("name"),
    code_name:              formData.get("code_name") || undefined,
    level:                  formData.get("level"),
    exam_type:              formData.get("exam_type") || undefined,
    institution:            formData.get("institution") || undefined,
    start_date:             formData.get("start_date"),
    training_weeks:         formData.get("training_weeks"),
    exam_prep_weeks:        formData.get("exam_prep_weeks"),
    attendance_present_pct: formData.get("attendance_present_pct"),
    attendance_partial_pct: formData.get("attendance_partial_pct"),
    canvas_course_id:       formData.get("canvas_course_id") || undefined,
    has_index_numbers:      formData.get("has_index_numbers") === "1",
    assigned_trainer_id:    formData.get("assigned_trainer_id") || undefined,
  };

  const parsed = TrainerCohortSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const data = parsed.data;

  const { data: cohort, error: cohortError } = await supabase
    .from("cohorts")
    .insert({
      name:                   data.name,
      code_name:              data.code_name ?? null,
      level:                  data.level,
      exam_type:              data.exam_type ?? null,
      platform:               PLATFORM_MAP[data.level],
      institution:            data.institution ?? null,
      start_date:             data.start_date,
      training_weeks:         data.training_weeks,
      exam_prep_weeks:        data.exam_prep_weeks,
      attendance_present_pct: data.attendance_present_pct,
      attendance_partial_pct: data.attendance_partial_pct,
      canvas_course_id:       data.canvas_course_id ?? null,
      has_index_numbers:      data.has_index_numbers ?? false,
      created_by:             user.id,
    })
    .select("id")
    .single();

  if (cohortError) return { error: cohortError.message };

  const ownerId = data.assigned_trainer_id ?? user.id;

  if (profile?.role !== "super_admin" || !data.assigned_trainer_id) {
    await supabase.from("cohort_access").insert({
      cohort_id:   cohort.id,
      trainer_id:  ownerId,
      role:        "owner",
      accepted_at: new Date().toISOString(),
    });
  } else {
    await supabase.from("cohort_access").insert({
      cohort_id:   cohort.id,
      trainer_id:  data.assigned_trainer_id,
      role:        "owner",
      accepted_at: new Date().toISOString(),
    });
  }

  const redirectBase = profile?.role === "super_admin" ? "/superadmin" : "/trainer";
  redirect(`${redirectBase}/cohorts/${cohort.id}`);
}

export type StatusUpdateState = { error?: string; success?: boolean } | null;

export async function updateCohortStatus(
  _prev: StatusUpdateState,
  formData: FormData
): Promise<StatusUpdateState> {
  const cohortId = formData.get("cohort_id") as string;
  const status = formData.get("status") as string;

  if (!cohortId || !status) return { error: "Missing fields" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (status === "hard_delete") {
    if (profile?.role !== "super_admin") return { error: "Only Super Admin can permanently delete a cohort" };
    // SA's RLS allows deletes via the regular client
    const { error } = await supabase.from("cohorts").delete().eq("id", cohortId);
    if (error) return { error: error.message };
    revalidatePath("/superadmin/dashboard");
    revalidatePath("/trainer/dashboard");
    redirect(profile.role === "super_admin" ? "/superadmin/dashboard" : "/trainer/dashboard");
  }

  // For regular status changes, verify access in app code then use service client
  // (RLS update policy only permits created_by = auth.uid() OR is_super_admin(),
  // so an assigned-but-non-creator owner's update would be silently dropped otherwise)
  if (profile?.role !== "super_admin") {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) return { error: "Not authorised to change cohort status" };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("cohorts")
    .update({ status: status as "active" | "completed" | "archived" | "deleted" })
    .eq("id", cohortId);

  if (error) return { error: error.message };

  revalidateTag("cohorts");
  revalidatePath("/trainer/dashboard");
  revalidatePath("/superadmin/dashboard");
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { success: true };
}

// ── Super Admin: reassign cohort owner ───────────────────────────────────

export async function reassignCohortOwner(
  cohortId: string,
  newTrainerId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return { error: "Only Super Admin can reassign cohort ownership" };

  // Verify new trainer exists and is active
  const { data: newOwner } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", newTrainerId)
    .single();
  if (!newOwner || !newOwner.is_active) return { error: "Trainer not found or inactive" };
  if (!["trainer", "quiz_creator"].includes(newOwner.role)) return { error: "Selected user is not a trainer or quiz creator" };

  // Remove existing owner entries (non-super-admin owners)
  const { data: currentOwners } = await supabase
    .from("cohort_access")
    .select("trainer_id")
    .eq("cohort_id", cohortId)
    .eq("role", "owner");

  if (currentOwners?.length) {
    const ownerIds = currentOwners.map((r) => r.trainer_id);
    // Get their roles to avoid removing super admins
    const { data: ownerProfiles } = await supabase
      .from("profiles")
      .select("id, role")
      .in("id", ownerIds);
    const nonSaOwners = (ownerProfiles ?? [])
      .filter((p) => p.role !== "super_admin")
      .map((p) => p.id);
    if (nonSaOwners.length) {
      await supabase
        .from("cohort_access")
        .delete()
        .eq("cohort_id", cohortId)
        .in("trainer_id", nonSaOwners);
    }
  }

  // Insert new owner
  const { error } = await supabase.from("cohort_access").upsert({
    cohort_id: cohortId,
    trainer_id: newTrainerId,
    role: "owner",
    accepted_at: new Date().toISOString(),
  }, { onConflict: "cohort_id,trainer_id" });

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}`);
  revalidatePath("/trainer/dashboard");
  return { success: true };
}

// ── Update cohort code name ───────────────────────────────────────────────

export async function updateCohortExamType(
  cohortId: string,
  examType: string | null
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "super_admin") {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) return { error: "Not authorised" };
  }

  const VALID = ["CCP", "SAA-C03", "DVA-C02", "SAP-C02", "DOP-C02"] as const;
  type ExamType = typeof VALID[number];
  const value = examType && (VALID as readonly string[]).includes(examType)
    ? examType as ExamType
    : null;

  const svc = createServiceClient();
  const { error } = await svc
    .from("cohorts")
    .update({ exam_type: value })
    .eq("id", cohortId);

  if (error) return { error: error.message };
  revalidateTag("cohorts");
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}

export async function updateCohortCodeName(
  cohortId: string,
  codeName: string
): Promise<{ success?: boolean; error?: string }> {
  // Permission check in app code; use service client so RLS doesn't silently
  // block non-creator owners (they have cohort_access.role = 'owner' but did
  // not create the cohort, so the RLS UPDATE policy would reject them).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "super_admin") {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) return { error: "Not authorised" };
  }

  const svc = createServiceClient();
  const value = codeName.trim() || null;
  const { error } = await svc
    .from("cohorts")
    .update({ code_name: value })
    .eq("id", cohortId);

  if (error) return { error: error.message };
  revalidateTag("cohorts");
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { success: true };
}

// ── Save analytics pass threshold ─────────────────────────────────────────────

export async function saveCohortThreshold(
  cohortId: string,
  threshold: number,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const clamped = Math.max(0, Math.min(100, Math.round(threshold)));
  const { error } = await supabase
    .from("cohorts")
    .update({ analytics_threshold: clamped })
    .eq("id", cohortId);

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true };
}
