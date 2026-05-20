import { createServiceClient } from "@/lib/supabase/server";
import VouchersClient from "./VouchersClient";

export default async function AdminVouchersPage() {
  const svc = createServiceClient();

  // Pool codes (available / already-used)
  const { data: pool } = await svc
    .from("admin_voucher_pool")
    .select("id, voucher_code, level, is_used, revoked_at, created_at")
    .order("created_at", { ascending: false });

  // All issued vouchers with trainee info
  const { data: vouchers } = await svc
    .from("vouchers")
    .select("id, voucher_code, exam_type, issued_date, attempt_no, deadline, revoked_at, trainee_id")
    .order("issued_date", { ascending: false });

  const voucherTraineeIds = [...new Set((vouchers ?? []).map((v) => v.trainee_id))];

  const [{ data: traineeRows }, ] = await Promise.all([
    voucherTraineeIds.length
      ? svc.from("trainees").select("id, full_name, personal_email, cohort_id").in("id", voucherTraineeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; personal_email: string; cohort_id: string }[] }),
  ]);

  const cohortIds = [...new Set((traineeRows ?? []).map((t) => t.cohort_id))];
  const { data: cohortRows } = cohortIds.length
    ? await svc.from("cohorts").select("id, name, level").in("id", cohortIds)
    : { data: [] as { id: string; name: string; level: string }[] };

  const traineeMap = new Map((traineeRows ?? []).map((t) => [t.id, t]));
  const cohortMap  = new Map((cohortRows  ?? []).map((c) => [c.id, c]));

  type PoolEntry = { id: string; code: string; level: "practitioner" | "associate"; isUsed: boolean; revokedAt: string | null; createdAt: string };
  type VoucherEntry = {
    id: string; code: string | null; examType: string; issuedDate: string;
    attemptNo: number; deadline: string | null; revokedAt: string | null;
    traineeId: string; traineeName: string; traineeEmail: string;
    cohortLevel: "practitioner" | "associate";
  };

  const poolEntries: PoolEntry[] = (pool ?? []).map((p) => ({
    id: p.id, code: p.voucher_code ?? "", level: p.level as "practitioner" | "associate",
    isUsed: p.is_used ?? false, revokedAt: (p.revoked_at as string | null) ?? null,
    createdAt: p.created_at as string,
  }));

  const voucherEntries: VoucherEntry[] = (vouchers ?? []).map((v) => {
    const t = traineeMap.get(v.trainee_id);
    const c = t ? cohortMap.get(t.cohort_id) : undefined;
    return {
      id: v.id,
      code: (v.voucher_code as string | null) ?? null,
      examType: v.exam_type as string,
      issuedDate: v.issued_date as string,
      attemptNo: v.attempt_no as number,
      deadline: (v.deadline as string | null) ?? null,
      revokedAt: (v.revoked_at as string | null) ?? null,
      traineeId: v.trainee_id,
      traineeName: t?.full_name ?? "—",
      traineeEmail: t?.personal_email ?? "—",
      cohortLevel: (c?.level ?? "practitioner") as "practitioner" | "associate",
    };
  });

  return <VouchersClient pool={poolEntries} vouchers={voucherEntries} />;
}
