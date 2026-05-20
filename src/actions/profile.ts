"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { z } from "zod";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

// ── Update own profile (trainer / QC / SA) ────────────────────────────────

const UpdateProfileSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters").max(120),
});

export type ProfileState = { error?: string; success?: boolean } | null;

export async function updateMyProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const parsed = UpdateProfileSchema.safeParse({
    full_name: formData.get("full_name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/trainer/profile");
  return { success: true };
}

// ── Request email change ──────────────────────────────────────────────────

const EmailChangeSchema = z.object({
  requested_email: z.string().email("Please enter a valid email address"),
  reason: z.string().min(10, "Please give a brief reason (at least 10 characters)").max(500),
});

export type EmailChangeState = { error?: string; success?: boolean } | null;

export async function requestEmailChange(
  _prev: EmailChangeState,
  formData: FormData
): Promise<EmailChangeState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Super Admins cannot change their email via request — doing so would let an
  // attacker lock out the account by rerouting the verification email.
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (myProfile?.role === "super_admin") {
    return { error: "Super Admin email addresses cannot be changed from this page." };
  }

  const parsed = EmailChangeSchema.safeParse({
    requested_email: formData.get("requested_email"),
    reason:          formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Check no pending request already exists
  const { data: existing } = await supabase
    .from("email_change_requests")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return { error: "You already have a pending email-change request. Please wait for it to be reviewed." };
  }

  const { error } = await supabase
    .from("email_change_requests")
    .insert({
      user_id:         user.id,
      current_email:   user.email ?? "",
      requested_email: parsed.data.requested_email.toLowerCase(),
      reason:          parsed.data.reason,
    });

  if (error) return { error: error.message };

  revalidatePath("/trainer/profile");
  return { success: true };
}

// ── SA: update any staff profile ──────────────────────────────────────────

const SAUpdateStaffSchema = z.object({
  target_id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  role:      z.enum(["trainer", "quiz_creator"]),
  is_active: z.coerce.boolean(),
});

export type SAProfileState = { error?: string; success?: boolean } | null;

export async function updateStaffProfileBySA(
  _prev: SAProfileState,
  formData: FormData
): Promise<SAProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (myProfile?.role !== "super_admin") return { error: "Super Admin only." };

  const parsed = SAUpdateStaffSchema.safeParse({
    target_id: formData.get("target_id"),
    full_name: formData.get("full_name"),
    role:      formData.get("role"),
    is_active: formData.get("is_active") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      role:      parsed.data.role,
      is_active: parsed.data.is_active,
    })
    .eq("id", parsed.data.target_id);

  if (error) return { error: error.message };

  revalidatePath("/superadmin/dashboard");
  revalidatePath(`/superadmin/staff/${parsed.data.target_id}`);
  return { success: true };
}

// ── SA: change a staff member's email directly ────────────────────────────

const SAEmailSchema = z.object({
  target_id: z.string().uuid(),
  new_email: z.string().email("Please enter a valid email address"),
});

export async function changeStaffEmailBySA(
  _prev: SAProfileState,
  formData: FormData
): Promise<SAProfileState> {
  const supabase = await createClient();
  const svc      = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (myProfile?.role !== "super_admin") return { error: "Super Admin only." };

  const parsed = SAEmailSchema.safeParse({
    target_id: formData.get("target_id"),
    new_email: formData.get("new_email"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Update email in auth (bypasses confirmation)
  const { error: authErr } = await svc.auth.admin.updateUserById(
    parsed.data.target_id,
    { email: parsed.data.new_email.toLowerCase(), email_confirm: true }
  );
  if (authErr) return { error: authErr.message };

  revalidatePath(`/superadmin/staff/${parsed.data.target_id}`);
  return { success: true };
}

// ── SA: approve an email change request ───────────────────────────────────

export async function approveEmailChange(
  requestId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const svc      = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (myProfile?.role !== "super_admin") return { error: "Super Admin only." };

  const { data: req } = await svc
    .from("email_change_requests")
    .select("id, user_id, requested_email, status")
    .eq("id", requestId)
    .single();

  if (!req)                   return { error: "Request not found." };
  if (req.status !== "pending") return { error: "Request is no longer pending." };

  // Apply the email change via admin API (bypasses confirmation)
  const { error: authErr } = await svc.auth.admin.updateUserById(req.user_id, {
    email:         req.requested_email,
    email_confirm: true,
  });
  if (authErr) return { error: authErr.message };

  // Mark approved
  await svc
    .from("email_change_requests")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/superadmin/dashboard");
  return { success: true };
}

// ── SA: deny an email change request ─────────────────────────────────────

export async function denyEmailChange(
  requestId: string,
  notes?: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const svc      = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (myProfile?.role !== "super_admin") return { error: "Super Admin only." };

  await svc
    .from("email_change_requests")
    .update({
      status:      "denied",
      notes:       notes ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  revalidatePath("/superadmin/dashboard");
  return { success: true };
}

// ── Change own password ───────────────────────────────────────────────────

export type ChangePasswordState = { error?: string; success?: boolean } | null;

export async function changeMyPassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const password = (formData.get("password") ?? "") as string;
  const confirm  = (formData.get("confirm_password") ?? "") as string;

  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm)  return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { success: true };
}

// ── SA: set a temp password for a staff member ────────────────────────────

export async function setStaffTempPassword(
  targetId: string
): Promise<{ tempPassword?: string; error?: string }> {
  const supabase = await createClient();
  const svc      = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: myProfile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "super_admin") return { error: "Super Admin only." };

  const { data: target } = await svc
    .from("profiles").select("role").eq("id", targetId)
    .in("role", ["trainer", "quiz_creator", "admin"]).single();
  if (!target) return { error: "Staff member not found." };

  const tempPassword = generateTempPassword();
  // email_confirm: true ensures sign-in works even if the invite link was never clicked
  const { error } = await svc.auth.admin.updateUserById(targetId, {
    password: tempPassword,
    email_confirm: true,
  });
  if (error) return { error: error.message };

  return { tempPassword };
}
