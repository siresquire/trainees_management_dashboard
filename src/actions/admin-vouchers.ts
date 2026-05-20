"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) throw new Error("Admin only");
  return user;
}

export async function uploadAdminVoucherPool(
  codes: string[],
  level: "practitioner" | "associate",
): Promise<{ inserted: number; duplicates: number; error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { inserted: 0, duplicates: 0, error: (e as Error).message };
  }

  if (!codes.length) return { inserted: 0, duplicates: 0 };

  const service = createServiceClient();
  const rows = codes.map((c) => ({ voucher_code: c.trim(), level }));

  // Upsert ignoring duplicates; count inserted vs existing
  const { data, error } = await service
    .from("admin_voucher_pool")
    .upsert(rows, { onConflict: "voucher_code", ignoreDuplicates: true })
    .select("id");

  if (error) return { inserted: 0, duplicates: 0, error: error.message };

  const inserted   = (data ?? []).length;
  const duplicates = codes.length - inserted;
  revalidatePath("/admin/dashboard");
  return { inserted, duplicates };
}

export async function getAdminVoucherPool(
  level: "practitioner" | "associate",
): Promise<{ data?: { id: string; voucher_code: string }[]; error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("admin_voucher_pool")
    .select("id, voucher_code")
    .eq("level", level)
    .eq("is_used", false)
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function deleteAdminVoucherPoolEntry(
  id: string,
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("admin_voucher_pool")
    .delete()
    .eq("id", id)
    .eq("is_used", false); // only allow deleting unused codes

  if (error) return { error: error.message };
  revalidatePath("/admin/vouchers");
  revalidatePath("/admin/dashboard");
  return {};
}

export async function deleteAdminVoucherPoolEntries(
  ids: string[],
): Promise<{ deleted: number; error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { deleted: 0, error: (e as Error).message };
  }

  if (!ids.length) return { deleted: 0 };

  const service = createServiceClient();
  const { data, error } = await service
    .from("admin_voucher_pool")
    .delete()
    .in("id", ids)
    .eq("is_used", false)
    .select("id");

  if (error) return { deleted: 0, error: error.message };
  revalidatePath("/admin/vouchers");
  revalidatePath("/admin/dashboard");
  return { deleted: (data ?? []).length };
}

// ── Revoked voucher actions ────────────────────────────────────────────────

export async function deleteRevokedVoucher(
  voucherId: string,
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const service = createServiceClient();

  // Get the voucher code before deleting
  const { data: voucher } = await service
    .from("vouchers")
    .select("voucher_code")
    .eq("id", voucherId)
    .not("revoked_at", "is", null)
    .single();

  if (!voucher) return { error: "Revoked voucher not found." };

  // Delete the vouchers record
  const { error: delErr } = await service
    .from("vouchers")
    .delete()
    .eq("id", voucherId)
    .not("revoked_at", "is", null);

  if (delErr) return { error: delErr.message };

  // Remove the pool entry for this code entirely
  if (voucher.voucher_code) {
    await service
      .from("admin_voucher_pool")
      .delete()
      .eq("voucher_code", voucher.voucher_code);
  }

  revalidatePath("/admin/vouchers");
  revalidatePath("/admin/dashboard");
  return {};
}

export async function restoreRevokedVoucherToPool(
  voucherId: string,
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const service = createServiceClient();

  // Get the voucher code
  const { data: voucher } = await service
    .from("vouchers")
    .select("voucher_code")
    .eq("id", voucherId)
    .not("revoked_at", "is", null)
    .single();

  if (!voucher?.voucher_code) return { error: "Revoked voucher not found." };

  // Reset the pool entry: mark as available again
  const { error } = await service
    .from("admin_voucher_pool")
    .update({
      is_used:    false,
      revoked_at: null,
      revoked_by: null,
      trainee_id: null,
      issued_by:  null,
      issued_at:  null,
    })
    .eq("voucher_code", voucher.voucher_code);

  if (error) return { error: error.message };

  // Remove the vouchers record so it no longer appears in the Revoked list
  await service.from("vouchers").delete().eq("id", voucherId);

  revalidatePath("/admin/vouchers");
  revalidatePath("/admin/dashboard");
  return {};
}

export async function updateAdminVoucherPoolCode(
  id: string,
  newCode: string,
): Promise<{ error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const trimmed = newCode.trim();
  if (!trimmed) return { error: "Code cannot be empty" };

  const service = createServiceClient();
  const { error } = await service
    .from("admin_voucher_pool")
    .update({ voucher_code: trimmed })
    .eq("id", id)
    .eq("is_used", false);

  if (error) return { error: error.message };
  revalidatePath("/admin/vouchers");
  revalidatePath("/admin/dashboard");
  return {};
}

export type ExamType = "CCP" | "SAA-C03" | "DVA-C02" | "SAP-C02" | "DOP-C02";

export async function issueVouchersToTrainees(
  traineeIds: string[],
  cohortId: string,
  examType: ExamType,
  level: "practitioner" | "associate",
): Promise<{ issued: number; error?: string }> {
  let user: { id: string };
  try {
    user = await assertAdmin();
  } catch (e) {
    return { issued: 0, error: (e as Error).message };
  }

  if (!traineeIds.length) return { issued: 0 };

  const service = createServiceClient();

  // Get enough unissued codes
  const { data: pool, error: poolErr } = await service
    .from("admin_voucher_pool")
    .select("id, voucher_code")
    .eq("level", level)
    .eq("is_used", false)
    .order("created_at", { ascending: true })
    .limit(traineeIds.length);

  if (poolErr) return { issued: 0, error: poolErr.message };
  if (!pool || pool.length < traineeIds.length) {
    return { issued: 0, error: `Not enough voucher codes in pool (have ${pool?.length ?? 0}, need ${traineeIds.length})` };
  }

  const now = new Date().toISOString();
  let issued = 0;

  for (let i = 0; i < traineeIds.length; i++) {
    const traineeId = traineeIds[i];
    const poolEntry = pool[i];

    // Get existing attempt count for this trainee + exam type
    const { data: existing } = await service
      .from("vouchers")
      .select("attempt_no")
      .eq("trainee_id", traineeId)
      .eq("exam_type", examType)
      .order("attempt_no", { ascending: false })
      .limit(1);

    const attempt_no = existing?.[0]?.attempt_no ? existing[0].attempt_no + 1 : 1;

    const { error: vErr } = await service.from("vouchers").insert({
      trainee_id:   traineeId,
      exam_type:    examType,
      issued_date:  now,
      attempt_no,
      issued_by:    user.id,
      voucher_code: poolEntry.voucher_code,
    });

    if (vErr) continue;

    await service
      .from("admin_voucher_pool")
      .update({ is_used: true, trainee_id: traineeId, issued_by: user.id, issued_at: now })
      .eq("id", poolEntry.id);

    issued++;
  }

  revalidatePath("/admin/dashboard");
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { issued };
}
