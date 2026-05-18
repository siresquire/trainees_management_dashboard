"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export type LoginState = { error?: string; success?: boolean } | null;

// ── Staff login (Trainer / QC / Super Admin) ──────────────────────────────

export async function signInStaff(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email    = (formData.get("email")    as string)?.trim().toLowerCase();
  const password = (formData.get("password") as string);

  if (!email)    return { error: "Email address is required." };
  if (!password) return { error: "Password is required." };

  const svc = createServiceClient();
  const { data: rows, error: rpcErr } = await svc.rpc("get_profile_by_email", { p_email: email });

  if (rpcErr) return { error: "Login check failed. Please try again." };

  const profile = rows?.[0];
  if (!profile) return { error: "No account found for this email. If you're new, use the request access form." };
  if (!profile.is_active) return { error: "Your account has been deactivated. Contact an administrator." };
  if (!["trainer", "quiz_creator", "super_admin"].includes(profile.role)) {
    return { error: "This login is for staff only. If you're a trainee, use the Trainee tab." };
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

  if (signInErr) {
    return { error: "Incorrect password. Use \"Forgot password?\" below to reset it." };
  }

  const dest = profile.role === "super_admin" ? "/superadmin/dashboard" : "/trainer/dashboard";
  redirect(dest);
}

// ── Trainee login ─────────────────────────────────────────────────────────

export async function signInTrainee(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const cohortId = (formData.get("cohort_id") as string)?.trim();
  const email    = (formData.get("email")    as string)?.trim().toLowerCase();
  const password = (formData.get("password") as string);

  if (!cohortId) return { error: "Please select your cohort." };
  if (!email)    return { error: "Email address is required." };
  if (!password) return { error: "Password is required." };

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

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

  if (signInErr) {
    return { error: "Incorrect password. Use \"Forgot password?\" below to reset it." };
  }

  redirect("/trainee/dashboard");
}

// ── Password reset request ────────────────────────────────────────────────

export async function requestPasswordReset(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "Email address is required." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?next=/auth/update-password`,
  });

  // Always succeed — don't reveal whether the email exists
  return { success: true };
}
