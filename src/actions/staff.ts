"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Helper ────────────────────────────────────────────────────────────────

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "super_admin") throw new Error("Super Admin only");
  return user;
}

// ── Invite a trainer (SA only) ────────────────────────────────────────────

const InviteSchema = z.object({
  full_name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  role: z.enum(["trainer", "quiz_creator"]),
});

export type InviteStaffState = { errors?: Record<string, string[]>; error?: string; success?: boolean } | null;

export async function inviteStaff(
  _prev: InviteStaffState,
  formData: FormData
): Promise<InviteStaffState> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = InviteSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { full_name, email, role } = parsed.data;
  const svc = createServiceClient();

  // Try invitation first; fall back to magic link OTP if user already exists
  const { error: inviteErr } = await (svc.auth.admin as any).inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/accept-invite`,
    data: { full_name, role },
  });

  if (!inviteErr) {
    revalidatePath("/superadmin/dashboard");
    return { success: true };
  }

  // User already exists — send magic link
  if ((inviteErr as any).code === "email_exists" || inviteErr.status === 422) {
    const { createClient: createAnonClient } = await import("@supabase/supabase-js");
    const anonClient = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false } }
    );
    const { error: otpErr } = await anonClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/accept-invite` },
    });
    if (otpErr) return { error: otpErr.message };
    revalidatePath("/superadmin/dashboard");
    return { success: true };
  }

  return { error: inviteErr.message };
}

// ── Submit access request (public — no auth) ─────────────────────────────

const RequestSchema = z.object({
  full_name:      z.string().min(2, "Name is required"),
  email:          z.string().email("Valid email required"),
  institution:    z.string().min(2, "Institution is required"),
  town:           z.string().min(1, "Town is required"),
  region:         z.string().min(1, "Region is required"),
  phone:          z.string().min(6, "Phone number is required"),
  reason:         z.string().min(10, "Please give a brief reason (at least 10 characters)"),
  requested_role: z.enum(["trainer", "quiz_creator"]),
});

export type AccessRequestState = {
  errors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
} | null;

export async function submitAccessRequest(
  _prev: AccessRequestState,
  formData: FormData
): Promise<AccessRequestState> {
  const parsed = RequestSchema.safeParse({
    full_name:      formData.get("full_name"),
    email:          formData.get("email"),
    institution:    formData.get("institution"),
    town:           formData.get("town"),
    region:         formData.get("region"),
    phone:          formData.get("phone"),
    reason:         formData.get("reason"),
    requested_role: formData.get("requested_role"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const svc = createServiceClient();

  // Check for a recent pending/approved request from the same email
  const { data: existing } = await svc
    .from("access_requests")
    .select("id, status")
    .eq("email", parsed.data.email.toLowerCase())
    .in("status", ["pending", "approved"])
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status === "approved") {
      return { error: "This email has already been approved. Check your inbox for an invitation link." };
    }
    return { error: "A request from this email is already pending review." };
  }

  const { error } = await svc.from("access_requests").insert({
    full_name:      parsed.data.full_name,
    email:          parsed.data.email.toLowerCase(),
    institution:    parsed.data.institution,
    town:           parsed.data.town,
    region:         parsed.data.region,
    phone:          parsed.data.phone,
    reason:         parsed.data.reason,
    requested_role: parsed.data.requested_role,
    status:         "pending",
  });

  if (error) return { error: error.message };
  return { success: true };
}

// ── Approve access request (SA only) ─────────────────────────────────────

export async function approveAccessRequest(
  requestId: string
): Promise<{ success?: boolean; error?: string }> {
  let saUser;
  try {
    saUser = await assertSuperAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();

  const { data: req } = await svc
    .from("access_requests")
    .select("id, full_name, email, status, requested_role")
    .eq("id", requestId)
    .single();

  if (!req) return { error: "Request not found" };
  if (req.status !== "pending") return { error: "Request has already been reviewed" };

  const roleToGrant = (req.requested_role === "trainer" ? "trainer" : "quiz_creator") as string;

  // Send invite with the requested role
  const { error: inviteErr } = await (svc.auth.admin as any).inviteUserByEmail(req.email, {
    redirectTo: `${appUrl}/auth/accept-invite`,
    data: { full_name: req.full_name, role: roleToGrant },
  });

  if (inviteErr && inviteErr.status !== 422 && (inviteErr as any).code !== "email_exists") {
    return { error: inviteErr.message };
  }

  // Mark approved
  await svc.from("access_requests").update({
    status: "approved",
    reviewed_by: saUser.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", requestId);

  revalidatePath("/superadmin/dashboard");
  return { success: true };
}

// ── Deny access request (SA only) ────────────────────────────────────────

export async function denyAccessRequest(
  requestId: string
): Promise<{ success?: boolean; error?: string }> {
  let saUser;
  try {
    saUser = await assertSuperAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();

  await svc.from("access_requests").update({
    status: "denied",
    reviewed_by: saUser.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", requestId);

  revalidatePath("/superadmin/dashboard");
  return { success: true };
}
