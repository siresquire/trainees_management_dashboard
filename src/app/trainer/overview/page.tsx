import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TrainerOverviewClient from "./TrainerOverviewClient";

export type TrainerOverviewCohort = {
  id:              string;
  name:            string;
  codeName:        string;
  level:           string;
  trainerName:     string | null;
  totalTrainees:   number;
  labsDoneTotal:   number;
  labsTotal:       number;
  kcsDoneTotal:    number;
  kcsTotal:        number;
  sessionsAttended: number;
  sessionsTotal:   number;
  vouchersIssued:  number;
  examPassed:      number;
  examFailed:      number;
  atRiskCount:     number;
};

export type TraineeSummary = {
  id:         string;
  name:       string;
  labPct:     number;
  kcPct:      number;
  attendPct:  number;
};

export type WeeklyTrendRow = {
  cohortId:   string;
  week:       number;
  labsDone:   number;
  labsTotal:  number;
  kcsDone:    number;
  kcsTotal:   number;
  attDone:    number;
  attTotal:   number;
};

/**
 * Fetch every page of a query that PostgREST would otherwise silently cap
 * at ~1000 rows. Keeps requesting 1000-row pages until a short page returns.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const SIZE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data } = await page(from, from + SIZE - 1);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SIZE) break;
  }
  return all;
}

export default async function TrainerOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  const svc = createServiceClient();

  // Resolve which cohort IDs this trainer can see
  let accessibleCohortIds: string[] = [];
  if (isSuperAdmin) {
    const { data: allCohorts } = await svc
      .from("cohorts")
      .select("id")
      .eq("status", "active");
    accessibleCohortIds = (allCohorts ?? []).map((c) => c.id);
  } else {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("cohort_id")
      .eq("trainer_id", user.id);
    accessibleCohortIds = (access ?? []).map((a) => a.cohort_id);
  }

  if (!accessibleCohortIds.length) {
    return <TrainerOverviewClient cohorts={[]} traineesByCohort={{}} weeklyTrend={[]} />;
  }

  // Phase 1 — parallel fetches that don't depend on each other.
  // Task/session counts come from a per-cohort aggregate RPC (one row per
  // cohort) instead of raw row fetches: with 13+ cohorts the raw
  // cohort_week_tasks query exceeded PostgREST's ~1000-row cap and silently
  // truncated, zeroing the lab/KC denominators for later cohorts.
  type DenomRow = { cohort_id: string; lab_tasks: number; kc_tasks: number; video_tasks: number; session_count: number };
  const [
    { data: cohorts },
    { data: denomRows },
    traineesData,
  ] = await Promise.all([
    svc.from("cohorts").select("id, name, code_name, level")
      .in("id", accessibleCohortIds)
      .eq("status", "active")
      .order("name"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc.rpc as any)("get_admin_cohort_denominators", { p_cohort_ids: accessibleCohortIds }) as Promise<{ data: DenomRow[] | null }>,
    fetchAll<{ id: string; cohort_id: string; full_name: string }>((from, to) =>
      svc.from("trainees").select("id, cohort_id, full_name")
        .is("deleted_at", null)
        .in("status", ["active", "completed"])
        .in("cohort_id", accessibleCohortIds)
        .order("id")
        .range(from, to)
    ),
  ]);

  const activeCohortIds = (cohorts ?? []).map((c) => c.id);
  const traineeIds = (traineesData ?? []).map((t) => t.id);

  // Phase 2 — depends on traineeIds + cohortIds.
  // Completion/attendance RPCs return one row per trainee — paginated so a
  // growing trainee population can never silently truncate again.
  type CompRow = { trainee_id: string; cohort_id: string; lab_count: number; kc_count: number };
  type AttRow  = { trainee_id: string; cohort_id: string; attended_count: number };
  const [
    { data: vouchers },
    { data: outcomes },
    completionRows,
    attendanceRows,
    { data: weeklyTrendRows },
    trainerNameByCohort,
    atRiskRows,
  ] = await Promise.all([
    traineeIds.length
      ? svc.from("vouchers")
          .select("trainee_id, cohort_id:trainees!inner(cohort_id)")
          .in("trainee_id", traineeIds)
          .is("revoked_at", null)
      : Promise.resolve({ data: [] as Array<{ trainee_id: string; cohort_id: unknown }> }),
    traineeIds.length
      ? svc.from("exam_outcomes")
          .select("trainee_id, outcome, cohort_id:trainees!inner(cohort_id)")
          .in("trainee_id", traineeIds)
      : Promise.resolve({ data: [] as Array<{ trainee_id: string; outcome: string; cohort_id: unknown }> }),
    activeCohortIds.length
      ? fetchAll<CompRow>((from, to) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (svc.rpc("get_admin_completion_summary", { p_cohort_ids: activeCohortIds }) as any).range(from, to))
      : Promise.resolve([] as CompRow[]),
    activeCohortIds.length
      ? fetchAll<AttRow>((from, to) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (svc.rpc("get_admin_attendance_summary", { p_cohort_ids: activeCohortIds }) as any).range(from, to))
      : Promise.resolve([] as AttRow[]),
    activeCohortIds.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (svc.rpc as any)("get_admin_weekly_trend", { p_cohort_ids: activeCohortIds }) as Promise<{ data: Array<{ cohort_id: string; week_number: number; labs_done: number; labs_total: number; kcs_done: number; kcs_total: number; att_done: number; att_total: number }> | null }>
      : Promise.resolve({ data: [] as Array<{ cohort_id: string; week_number: number; labs_done: number; labs_total: number; kcs_done: number; kcs_total: number; att_done: number; att_total: number }> }),
    // Cohort owner (trainer) names — for chart tooltips and the summary table
    (async () => {
      const map = new Map<string, string>();
      if (!activeCohortIds.length) return map;
      const { data: ownerAccess } = await svc
        .from("cohort_access")
        .select("cohort_id, trainer_id")
        .eq("role", "owner")
        .in("cohort_id", activeCohortIds);
      const ownerIds = [...new Set((ownerAccess ?? []).map((o) => o.trainer_id))];
      if (!ownerIds.length) return map;
      const { data: ownerProfiles } = await svc
        .from("profiles")
        .select("id, full_name")
        .in("id", ownerIds);
      const nameById = new Map((ownerProfiles ?? []).map((p) => [p.id, p.full_name]));
      for (const o of ownerAccess ?? []) {
        if (map.has(o.cohort_id)) continue; // first owner wins
        const n = nameById.get(o.trainer_id);
        if (n) map.set(o.cohort_id, n);
      }
      return map;
    })(),
    // At-risk trainees (behind ≥50% on labs/KCs expected by the current week,
    // or below 50% attendance) — counted per cohort for the summary table
    activeCohortIds.length
      ? fetchAll<{ cohort_id: string; trainee_id: string }>((from, to) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (svc.rpc as any)("get_admin_at_risk", { p_cohort_ids: activeCohortIds }).range(from, to))
      : Promise.resolve([] as Array<{ cohort_id: string; trainee_id: string }>),
  ]);

  const atRiskByCohort = new Map<string, number>();
  for (const r of atRiskRows) {
    const cid = String(r.cohort_id);
    atRiskByCohort.set(cid, (atRiskByCohort.get(cid) ?? 0) + 1);
  }

  // Defensive: only count rows belonging to known active trainees. Protects
  // against soft-deleted duplicates inflating totals and against truncated
  // RPC result sets (also enforced server-side after migration 20260606000002).
  const validTraineeIds = new Set(traineeIds);

  // ── Build per-cohort aggregates ──────────────────────────────────────────

  const labsTasksByCohort = new Map<string, number>();
  const kcsTasksByCohort  = new Map<string, number>();
  const sessionsByCohort  = new Map<string, number>();
  for (const d of denomRows ?? []) {
    const cid = String(d.cohort_id);
    labsTasksByCohort.set(cid, Number(d.lab_tasks));
    kcsTasksByCohort.set(cid,  Number(d.kc_tasks));
    sessionsByCohort.set(cid,  Number(d.session_count));
  }

  const traineesByCohortCount = new Map<string, number>();
  for (const t of traineesData ?? []) traineesByCohortCount.set(t.cohort_id, (traineesByCohortCount.get(t.cohort_id) ?? 0) + 1);

  // Per-trainee completion totals (summed across weeks)
  const labByTrainee = new Map<string, { cohortId: string; lab: number; kc: number }>();
  for (const row of completionRows ?? []) {
    const tid = row.trainee_id;
    if (!validTraineeIds.has(tid)) continue; // skip deleted/dropped trainees
    const cid = String(row.cohort_id);
    const curr = labByTrainee.get(tid) ?? { cohortId: cid, lab: 0, kc: 0 };
    labByTrainee.set(tid, { cohortId: cid, lab: curr.lab + Number(row.lab_count), kc: curr.kc + Number(row.kc_count) });
  }

  // Per-cohort totals (sum over all trainees)
  const labsDoneByCohort = new Map<string, number>();
  const kcsDoneByCohort  = new Map<string, number>();
  for (const [, v] of labByTrainee) {
    labsDoneByCohort.set(v.cohortId, (labsDoneByCohort.get(v.cohortId) ?? 0) + v.lab);
    kcsDoneByCohort.set(v.cohortId,  (kcsDoneByCohort.get(v.cohortId)  ?? 0) + v.kc);
  }

  // Per-trainee attendance
  const attendByTrainee = new Map<string, number>();
  for (const row of attendanceRows ?? []) {
    if (!validTraineeIds.has(row.trainee_id)) continue; // skip deleted/dropped trainees
    attendByTrainee.set(row.trainee_id, (attendByTrainee.get(row.trainee_id) ?? 0) + Number(row.attended_count));
  }

  const attendanceDoneByCohort = new Map<string, number>();
  for (const [tid, count] of attendByTrainee) {
    const t = traineesData?.find((x) => x.id === tid);
    if (t) attendanceDoneByCohort.set(t.cohort_id, (attendanceDoneByCohort.get(t.cohort_id) ?? 0) + count);
  }

  // Vouchers per cohort
  const vouchersByCohort = new Map<string, number>();
  for (const v of vouchers ?? []) {
    const cid = (v as unknown as { cohort_id: { cohort_id: string } }).cohort_id?.cohort_id;
    if (cid) vouchersByCohort.set(cid, (vouchersByCohort.get(cid) ?? 0) + 1);
  }

  const passedByCohort = new Map<string, number>();
  const failedByCohort = new Map<string, number>();
  for (const o of outcomes ?? []) {
    const cid = (o as unknown as { cohort_id: { cohort_id: string } }).cohort_id?.cohort_id;
    if (!cid) continue;
    if (o.outcome === "passed") passedByCohort.set(cid, (passedByCohort.get(cid) ?? 0) + 1);
    if (o.outcome === "failed") failedByCohort.set(cid, (failedByCohort.get(cid) ?? 0) + 1);
  }

  const overviewCohorts: TrainerOverviewCohort[] = (cohorts ?? [])
    .map((c) => {
      const total     = traineesByCohortCount.get(c.id) ?? 0;
      const labsTotal = labsTasksByCohort.get(c.id) ?? 0;
      const kcsTotal  = kcsTasksByCohort.get(c.id)  ?? 0;
      const sesTotal  = sessionsByCohort.get(c.id)  ?? 0;
      return {
        id:               c.id,
        name:             c.name,
        codeName:         c.code_name ?? c.name,
        level:            c.level ?? "practitioner",
        trainerName:      trainerNameByCohort.get(c.id) ?? null,
        totalTrainees:    total,
        labsDoneTotal:    labsDoneByCohort.get(c.id) ?? 0,
        labsTotal:        labsTotal * total,
        kcsDoneTotal:     kcsDoneByCohort.get(c.id)  ?? 0,
        kcsTotal:         kcsTotal * total,
        sessionsAttended: attendanceDoneByCohort.get(c.id) ?? 0,
        sessionsTotal:    sesTotal * total,
        vouchersIssued:   vouchersByCohort.get(c.id) ?? 0,
        examPassed:       passedByCohort.get(c.id)   ?? 0,
        examFailed:       failedByCohort.get(c.id)   ?? 0,
        atRiskCount:      atRiskByCohort.get(c.id)   ?? 0,
      };
    })
    // Alphabetical by the code name shown in charts/tables — easier lookup
    .sort((a, b) => a.codeName.localeCompare(b.codeName, undefined, { sensitivity: "base" }));

  // ── Build per-cohort trainee summaries for the drilldown panel ────────────

  const traineesByCohort: Record<string, TraineeSummary[]> = {};
  for (const c of cohorts ?? []) {
    const labT = labsTasksByCohort.get(c.id) ?? 0;
    const kcT  = kcsTasksByCohort.get(c.id)  ?? 0;
    const sesT = sessionsByCohort.get(c.id)  ?? 0;

    const list = (traineesData ?? [])
      .filter((t) => t.cohort_id === c.id)
      .map((t) => {
        const prog    = labByTrainee.get(t.id);
        const labPct  = labT > 0 ? Math.round(((prog?.lab ?? 0) / labT) * 100) : 0;
        const kcPct   = kcT  > 0 ? Math.round(((prog?.kc  ?? 0) / kcT)  * 100) : 0;
        const attPct  = sesT > 0 ? Math.round(((attendByTrainee.get(t.id) ?? 0) / sesT) * 100) : 0;
        return { id: t.id, name: t.full_name, labPct, kcPct, attendPct: attPct };
      })
      .sort((a, b) => (b.labPct + b.kcPct) - (a.labPct + a.kcPct));

    traineesByCohort[c.id] = list;
  }

  const weeklyTrend: WeeklyTrendRow[] = (weeklyTrendRows ?? []).map((r) => ({
    cohortId:  String(r.cohort_id),
    week:      Number(r.week_number),
    labsDone:  Number(r.labs_done),
    labsTotal: Number(r.labs_total),
    kcsDone:   Number(r.kcs_done),
    kcsTotal:  Number(r.kcs_total),
    attDone:   Number(r.att_done),
    attTotal:  Number(r.att_total),
  }));

  return (
    <TrainerOverviewClient
      cohorts={overviewCohorts}
      traineesByCohort={traineesByCohort}
      weeklyTrend={weeklyTrend}
    />
  );
}
