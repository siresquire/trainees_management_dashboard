"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export type LoginState = { error?: string; success?: boolean } | null;

// ── Staff login (Trainer / QC / Super Admin) ──────────────────────────────
// Uses the get_profile_by_email RPC (security definer) to validate
// the user without relying on auth.admin.getUserByEmail (not in v2).

export async function sendStaffMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "Email address is required." };

  const svc = createServiceClient();

  // Look up the profile via the security-definer RPC
  const { data: rows, error: rpcErr } = await svc.rpc("get_profile_by_email", {
    p_email: email,
  });

  if (rpcErr) return { error: "Login check failed. Please try again." };

  const profile = rows?.[0];

  if (!profile) {
    return {
      error:
        "No account found for this email. If you're a new trainer or quiz creator, use the request access form.",
    };
  }
  if (!profile.is_active) {
    return {
      error:
        "Your account has been deactivated. Please contact an administrator.",
    };
  }
  if (!["trainer", "quiz_creator", "super_admin"].includes(profile.role)) {
    return {
      error:
        "This login is for staff only. If you're a trainee, use the Trainee tab.",
    };
  }

  // Send OTP (magic link) — shouldCreateUser: false rejects unknown emails
  const anonClient = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false } }
  );
  const { error: otpErr } = await anonClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/callback` },
  });

  if (otpErr) return { error: otpErr.message };
  return { success: true };
}

// ── Trainee login ─────────────────────────────────────────────────────────

export async function sendTraineeMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const cohortId = (formData.get("cohort_id") as string)?.trim();
  const email    = (formData.get("email") as string)?.trim().toLowerCase();

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
    return {
      error:
        "Email not found in this cohort's roster. Check your email address or select the correct cohort.",
    };
  }
  if (trainee.status !== "active") {
    return { error: "Your enrolment is not currently active. Contact your trainer." };
  }
  if (!trainee.user_id) {
    return {
      error:
        "Your account hasn't been set up yet. Ask your trainer to send you an invitation.",
    };
  }

  const anonClient = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false } }
  );
  const { error: otpErr } = await anonClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/callback` },
  });

  if (otpErr) return { error: otpErr.message };
  return { success: true };
}
