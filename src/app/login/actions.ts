"use server";

import { createServiceClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; dest?: string } | null;

// ── Staff: validate only (auth happens client-side) ───────────────────────
export async function validateStaff(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email) return { error: "Email address is required." };

  const svc = createServiceClient();
  const { data: rows, error: rpcErr } = await svc.rpc("get_profile_by_email", { p_email: email });

  if (rpcErr) return { error: "Login check failed. Please try again." };

  const profile = rows?.[0];
  if (!profile) return { error: "No account found for this email. If you're new, use the request access form." };
  if (!profile.is_active) return { error: "Your account has been deactivated. Contact an administrator." };
  if (!["trainer", "quiz_creator", "super_admin", "admin"].includes(profile.role)) {
    return { error: "This login is for staff only. If you're a trainee, use the Trainee tab." };
  }

  const dest =
    profile.role === "super_admin" ? "/superadmin/dashboard" :
    profile.role === "admin"       ? "/admin/dashboard" :
    "/trainer/dashboard";
  return { dest };
}

// ── Trainee: validate only (auth happens client-side) ─────────────────────
export async function validateTrainee(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const cohortId = (formData.get("cohort_id") as string)?.trim();
  const email    = (formData.get("email")     as string)?.trim().toLowerCase();

  if (!cohortId) return { error: "Please select your cohort." };
  if (!email)    return { error: "Email address is required." };

  const svc = createServiceClient();
  const { data: trainee } = await svc
    .from("trainees")
    .select("id, user_id, status")
    .eq("cohort_id", cohortId)
    .or(`personal_email.eq.${email},amalitech_email.eq.${email}`)
    .maybeSingle();

  if (!trainee) {
    return { error: "Email not found in this cohort. Check your email or select the correct cohort." };
  }
  if (trainee.status !== "active") {
    return { error: "Your enrolment is not currently active. Contact your trainer." };
  }
  if (!trainee.user_id) {
    return { error: "Your account hasn't been set up yet. Ask your trainer to send you an invitation." };
  }

  return { dest: "/trainee/dashboard" };
}

// ── Password reset request ────────────────────────────────────────────────
// (kept as server action — only sends email, no session involved)
export type ResetState = { error?: string; success?: boolean } | null;

export async function requestPasswordReset(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "Email address is required." };
  // Actual reset is handled client-side in forgot-password/page.tsx
  return { success: true };
}
