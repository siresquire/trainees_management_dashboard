"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { z } from "zod";

function makeTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes).map((b) => chars[(b as number) % chars.length]).join("");
}

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
  role: z.enum(["trainer", "quiz_creator", "admin", "pro_skills_instructor"]),
});

export type InviteStaffState = {
  errors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
  inviteLink?: string;
  /** Set when the person already has an account — SA shares this directly instead of a link */
  tempPassword?: string;
  email?: string;
} | null;

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
  const resendKey = process.env.RESEND_API_KEY;

  // ── Pre-check: does this email already have an auth account? ──────────────
  // We scan auth.users before calling generateLink so we never create a
  // second account for the same email (Supabase can duplicate unconfirmed users).
  const { data: usersPage } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingAuthUser = usersPage?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existingAuthUser) {
    // Account already exists — set a temp password so SA can share it directly.
    // No magic link needed: links expire in 1 hour and may not arrive by email.
    const tempPassword = makeTempPassword();
    const { error: pwdErr } = await svc.auth.admin.updateUserById(existingAuthUser.id, {
      password: tempPassword,
      email_confirm: true,
    });
    if (pwdErr) return { error: `Failed to set temp password: ${pwdErr.message}` };

    revalidatePath("/superadmin/dashboard");
    return { success: true, tempPassword, email };
  }

  // ── New user — generate invite link ──────────────────────────────────────
  if (resendKey) {
    const { data: inviteData, error: inviteErr } = await (svc.auth.admin as any).generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${appUrl}/auth/accept-invite`, data: { full_name, role } },
    });

    if (inviteErr) return { error: `Failed to generate invite link: ${inviteErr.message}` };

    const inviteLink: string | null = inviteData?.properties?.action_link ?? inviteData?.action_link ?? null;
    if (!inviteLink) return { error: "Failed to generate invite link (empty response)" };

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Amalitech Dashboard <onboarding@resend.dev>";
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "You've been invited to Amalitech Training Dashboard",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <div style="width:40px;height:40px;background:#f97316;border-radius:10px;margin-bottom:20px"></div>
            <h2 style="color:#0f172a;margin:0 0 8px">You're invited to Amalitech Dashboard</h2>
            <p style="color:#475569;margin:0 0 24px">Hi ${full_name}, you have been invited as a <strong>${role.replace("_", " ")}</strong>. Click the button below to set up your account.</p>
            <a href="${inviteLink}" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Accept invitation</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you weren't expecting this, you can ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.json().catch(() => ({}));
      return {
        error: `Email delivery failed (${(body as { message?: string }).message ?? emailRes.status}). Share this link directly:`,
        inviteLink,
      };
    }

    revalidatePath("/superadmin/dashboard");
    return { success: true, inviteLink };
  } else {
    // Fallback: Supabase email (requires SMTP in Supabase dashboard)
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
    } else {
      return { error: inviteErr.message };
    }
  }

  revalidatePath("/superadmin/dashboard");
  return { success: true };
}

// ── Submit access request (public — no auth) ─────────────────────────────

function isValidGhanaOrRwandaPhone(raw: string): boolean {
  const s = raw.replace(/[\s\-().]/g, "");
  // Ghana: +233 or 0, then a digit 2-9, then 8 more digits (total 10 local / 13 with +)
  if (/^(\+233[2-9]\d{8}|0[2-9]\d{8})$/.test(s)) return true;
  // Rwanda: +250 or 07/08, then 8 more digits
  if (/^(\+250[7-9]\d{8}|0[7-9]\d{8})$/.test(s)) return true;
  return false;
}

const RequestSchema = z.object({
  full_name:      z.string().min(2, "Name is required"),
  email:          z.string().email("Valid email required"),
  institution:    z.string().min(2, "Institution is required"),
  town:           z.string().min(1, "Town / City is required"),
  region:         z.string().min(1, "Region is required"),
  phone:          z.string().refine(isValidGhanaOrRwandaPhone, {
    message: "Enter a valid Ghana (+233) or Rwanda (+250) phone number",
  }),
  reason:         z.string().optional(),
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

  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    // Generate the invite link server-side, send email via Resend directly
    const { data: linkData, error: linkErr } = await (svc.auth.admin as any).generateLink({
      type: "invite",
      email: req.email,
      options: {
        redirectTo: `${appUrl}/auth/accept-invite`,
        data: { full_name: req.full_name, role: roleToGrant },
      },
    });

    if (linkErr) return { error: `Failed to generate invite link: ${linkErr.message}` };

    const inviteLink: string = linkData?.properties?.action_link ?? linkData?.action_link;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Amalitech Dashboard <onboarding@resend.dev>";

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: req.email,
        subject: "You've been invited to Amalitech Training Dashboard",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <div style="width:40px;height:40px;background:#f97316;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:20px">
              <span style="color:#fff;font-weight:700;font-size:18px">A</span>
            </div>
            <h2 style="color:#0f172a;margin:0 0 8px">You're invited to Amalitech Dashboard</h2>
            <p style="color:#475569;margin:0 0 24px">Hi ${req.full_name}, you have been approved as a <strong>${roleToGrant.replace("_", " ")}</strong>. Click the button below to set up your account.</p>
            <a href="${inviteLink}" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Accept invitation</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you weren't expecting this invitation, you can ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.json().catch(() => ({}));
      return { error: `Failed to send invite email: ${(body as { message?: string }).message ?? emailRes.status}` };
    }
  } else {
    // Fallback: let Supabase send the email (requires SMTP configured in Supabase dashboard)
    const { error: inviteErr } = await (svc.auth.admin as any).inviteUserByEmail(req.email, {
      redirectTo: `${appUrl}/auth/accept-invite`,
      data: { full_name: req.full_name, role: roleToGrant },
    });

    if (inviteErr && inviteErr.status !== 422 && (inviteErr as any).code !== "email_exists") {
      return { error: inviteErr.message };
    }
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

// ── Remove a staff account (SA only) — deletes auth user + cascades profile ─

export async function removeStaffAccount(
  targetId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();

  // Verify target is a trainer/quiz_creator (not SA)
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", targetId)
    .in("role", ["trainer", "quiz_creator"])
    .single();

  if (!profile) return { error: "Staff member not found or cannot be removed." };

  const { error } = await svc.auth.admin.deleteUser(targetId);
  if (error) return { error: error.message };

  revalidatePath("/superadmin/dashboard");
  return { success: true };
}
