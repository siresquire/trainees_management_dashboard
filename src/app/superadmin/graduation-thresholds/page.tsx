import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GraduationThresholdsClient from "./GraduationThresholdsClient";

export type GradRow = {
  cohortId:    string;
  cohortCode:  string;
  cohortName:  string;
  traineeId:   string;
  traineeName: string;
  labsDone:    number;
  labsTotal:   number;
  kcsDone:     number;
  kcsTotal:    number;
  graduated:   boolean;
};

export default async function GraduationThresholdsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, code_name")
    .eq("level", "practitioner")
    .not("status", "eq", "deleted")
    .order("name");

  if (!cohorts?.length) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Graduation Thresholds</h1>
        <p className="text-slate-500 text-sm">No practitioner cohorts found.</p>
      </div>
    );
  }

  const cohortIds = cohorts.map((c) => c.id);

  type CompRow = { trainee_id: string; cohort_id: string; lab_count: number; kc_count: number };

  const [
    { data: trainees },
    { data: completionRows },
    { data: tasks },
  ] = await Promise.all([
    supabase
      .from("trainees")
      .select("id, full_name, cohort_id, graduated")
      .in("cohort_id", cohortIds)
      .in("status", ["active", "completed"])
      .is("deleted_at", null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_admin_completion_summary", { p_cohort_ids: cohortIds }) as Promise<{ data: CompRow[] | null }>,
    supabase
      .from("cohort_week_tasks")
      .select("cohort_id, task_type")
      .in("cohort_id", cohortIds),
  ]);

  // Per-cohort task totals (denominator)
  const cohortTotals = new Map<string, { lab: number; kc: number }>();
  for (const task of tasks ?? []) {
    const entry = cohortTotals.get(task.cohort_id) ?? { lab: 0, kc: 0 };
    if (task.task_type === "lab") entry.lab++;
    else if (task.task_type === "kc") entry.kc++;
    cohortTotals.set(task.cohort_id, entry);
  }

  // Completion counts per trainee
  const completionMap = new Map<string, { lab: number; kc: number }>();
  for (const r of completionRows ?? []) {
    completionMap.set(r.trainee_id, {
      lab: Number(r.lab_count),
      kc:  Number(r.kc_count),
    });
  }

  const cohortMap = new Map(cohorts.map((c) => [c.id, c]));

  const rows: GradRow[] = (trainees ?? []).map((t) => {
    const cohort  = cohortMap.get(t.cohort_id)!;
    const comp    = completionMap.get(t.id) ?? { lab: 0, kc: 0 };
    const totals  = cohortTotals.get(t.cohort_id) ?? { lab: 0, kc: 0 };
    return {
      cohortId:    t.cohort_id,
      cohortCode:  cohort.code_name ?? cohort.name,
      cohortName:  cohort.name,
      traineeId:   t.id,
      traineeName: t.full_name,
      labsDone:    comp.lab,
      labsTotal:   totals.lab,
      kcsDone:     comp.kc,
      kcsTotal:    totals.kc,
      graduated:   t.graduated ?? false,
    };
  });

  // Sort: cohort name → graduated first → total completions asc (minimum grad at the top)
  rows.sort((a, b) => {
    const cc = a.cohortName.localeCompare(b.cohortName);
    if (cc !== 0) return cc;
    if (a.graduated !== b.graduated) return a.graduated ? -1 : 1;
    return (a.labsDone + a.kcsDone) - (b.labsDone + b.kcsDone);
  });

  return <GraduationThresholdsClient rows={rows} />;
}
