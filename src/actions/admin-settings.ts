"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles").select("role, id").eq("id", user.id).single();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) throw new Error("Admin only");
  return { user, profileId: profile!.id };
}

// ── Revoke a voucher from admin_voucher_pool ──────────────────────────────

export async function revokeAdminVoucher(
  poolId: string
): Promise<{ error?: string }> {
  let profileId: string;
  try {
    ({ profileId } = await assertAdmin());
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("admin_voucher_pool")
    .update({ is_used: true, revoked_at: new Date().toISOString(), revoked_by: profileId })
    .eq("id", poolId)
    .is("revoked_at", null);

  if (error) return { error: error.message };
  revalidatePath("/admin/dashboard");
  return {};
}

// ── Set deadline on an issued voucher (in vouchers table) ─────────────────

export async function setVoucherDeadline(
  voucherId: string,
  deadline: string | null,
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("vouchers")
    .update({ deadline: deadline ?? null })
    .eq("id", voucherId);

  if (error) return { error: error.message };
  revalidatePath("/admin/dashboard");
  return {};
}

// ── Revoke a voucher record (vouchers table) ──────────────────────────────

export async function revokeVoucher(
  voucherId: string
): Promise<{ error?: string }> {
  let profileId: string;
  try {
    ({ profileId } = await assertAdmin());
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("vouchers")
    .update({ revoked_at: new Date().toISOString(), revoked_by: profileId })
    .eq("id", voucherId)
    .is("revoked_at", null);

  if (error) return { error: error.message };
  revalidatePath("/admin/dashboard");
  return {};
}

// ── Save admin thresholds ─────────────────────────────────────────────────

export async function saveAdminThresholds(
  level: "practitioner" | "associate",
  dataBundlePct: number,
  stipendPct: number,
): Promise<{ error?: string }> {
  let profileId: string;
  try {
    ({ profileId } = await assertAdmin());
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (dataBundlePct < 0 || dataBundlePct > 100 || stipendPct < 0 || stipendPct > 100) {
    return { error: "Thresholds must be between 0 and 100." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("admin_settings")
    .update({
      data_bundle_threshold_pct: dataBundlePct,
      stipend_threshold_pct:     stipendPct,
      updated_at:                new Date().toISOString(),
      updated_by:                profileId,
    })
    .eq("level", level);

  if (error) return { error: error.message };
  revalidatePath("/admin/dashboard");
  return {};
}

// ── Save practitioner attendance threshold minutes ─────────────────────────

export async function saveAttendanceThresholds(
  universityMins: number,
  externalMins: number,
): Promise<{ error?: string }> {
  let profileId: string;
  try {
    ({ profileId } = await assertAdmin());
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (universityMins < 1 || externalMins < 1) {
    return { error: "Thresholds must be at least 1 minute." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("admin_settings")
    .update({
      practitioner_university_threshold_mins: universityMins,
      practitioner_external_threshold_mins:   externalMins,
      updated_at: new Date().toISOString(),
      updated_by: profileId,
    } as Record<string, unknown>)
    .eq("level", "practitioner");

  if (error) return { error: error.message };
  revalidatePath("/admin/dashboard");
  return {};
}

// ── Load admin thresholds ─────────────────────────────────────────────────

export async function loadAdminThresholds(): Promise<{
  practitioner: { dataBundlePct: number; stipendPct: number; universityMins: number; externalMins: number };
  associate:    { dataBundlePct: number; stipendPct: number };
  error?: string;
}> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("admin_settings")
    .select("level, data_bundle_threshold_pct, stipend_threshold_pct, practitioner_university_threshold_mins, practitioner_external_threshold_mins");

  if (error) return {
    practitioner: { dataBundlePct: 0, stipendPct: 0, universityMins: 45, externalMins: 60 },
    associate:    { dataBundlePct: 0, stipendPct: 0 },
    error: error.message,
  };

  const byLevel = new Map((data ?? []).map((r) => [r.level, r as Record<string, unknown>]));
  const pr = byLevel.get("practitioner");
  const as = byLevel.get("associate");
  return {
    practitioner: {
      dataBundlePct:  Number(pr?.data_bundle_threshold_pct ?? 0),
      stipendPct:     Number(pr?.stipend_threshold_pct ?? 0),
      universityMins: Number(pr?.practitioner_university_threshold_mins ?? 45),
      externalMins:   Number(pr?.practitioner_external_threshold_mins   ?? 60),
    },
    associate: {
      dataBundlePct: Number(as?.data_bundle_threshold_pct ?? 0),
      stipendPct:    Number(as?.stipend_threshold_pct ?? 0),
    },
  };
}

// ── Load just the attendance threshold mins (used by cohort forms) ─────────

export async function loadAttendanceThresholdMins(): Promise<{ universityMins: number; externalMins: number }> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("admin_settings")
    .select("practitioner_university_threshold_mins, practitioner_external_threshold_mins")
    .eq("level", "practitioner")
    .single();

  const r = data as Record<string, unknown> | null;
  return {
    universityMins: Number(r?.practitioner_university_threshold_mins ?? 45),
    externalMins:   Number(r?.practitioner_external_threshold_mins   ?? 60),
  };
}
