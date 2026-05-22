"use server";

import { createServiceClient } from "@/lib/supabase/server";

export type WeeklyStatRow = {
  traineeId:     string;
  labsDone:      number;
  kcsDone:       number;
  sessionsAttended: number;
};

export async function fetchAdminWeeklyStats(
  cohortIds: string[],
  weekNumbers: number[]
): Promise<{ data: WeeklyStatRow[] } | { error: string }> {
  if (!cohortIds.length || !weekNumbers.length) return { data: [] };
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("get_admin_weekly_stats", {
    p_cohort_ids:   cohortIds,
    p_week_numbers: weekNumbers,
  });
  if (error) return { error: error.message };
  return {
    data: (data ?? []).map((r) => ({
      traineeId:        String(r.trainee_id),
      labsDone:         Number(r.lab_count),
      kcsDone:          Number(r.kc_count),
      sessionsAttended: Number(r.attended_count),
    })),
  };
}
