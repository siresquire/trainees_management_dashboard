"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type TraineeDetailData = {
  trainee: {
    id: string;
    full_name: string;
    personal_email: string;
    amalitech_email: string | null;
    status: string;
    serial_no: number | null;
  };
  weekBreakdown: {
    week_number: number;
    lab_done: number;
    lab_total: number;
    kc_done: number;
    kc_total: number;
    is_pending: boolean;
  }[];
  attendanceSessions: {
    session_id: string;
    week_number: number | null;
    topic: string;
    started_at: string;
    status: string;
    duration_mins: number;
    total_mins: number;
    is_override: boolean;
  }[];
  totals: {
    labs_done: number;
    labs_total: number;
    kcs_done: number;
    kcs_total: number;
    sessions_attended: number;
    sessions_total: number;
  };
};

export async function getTraineeDetail(
  traineeId: string,
  cohortId: string,
): Promise<{ data?: TraineeDetailData; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, full_name, personal_email, amalitech_email, status, serial_no")
    .eq("id", traineeId)
    .single();
  if (!trainee) return { error: "Trainee not found" };

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("start_date, training_weeks")
    .eq("id", cohortId)
    .single();
  if (!cohort) return { error: "Cohort not found" };

  const currentWeek = Math.min(
    cohort.training_weeks,
    Math.max(1, Math.ceil((Date.now() - new Date(cohort.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000))),
  );

  const [
    { data: tasks },
    { data: sessions },
  ] = await Promise.all([
    supabase
      .from("cohort_week_tasks")
      .select("id, task_type, week_number")
      .eq("cohort_id", cohortId),
    supabase
      .from("sessions")
      .select("id, topic, started_at, week_number, total_duration_mins")
      .eq("cohort_id", cohortId)
      .order("started_at", { ascending: false }),
  ]);

  const taskIds = (tasks ?? []).map((t) => t.id);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  const [
    { data: completions },
    { data: attendanceRows },
  ] = await Promise.all([
    taskIds.length
      ? supabase
          .from("completions")
          .select("task_id")
          .eq("trainee_id", traineeId)
          .in("task_id", taskIds)
      : { data: [] },
    sessionIds.length
      ? supabase
          .from("attendance")
          .select("session_id, status, duration_mins, total_session_mins")
          .eq("trainee_id", traineeId)
          .in("session_id", sessionIds)
      : { data: [] },
  ]);

  let overrideSessionIds: Set<string> = new Set();
  try {
    if (sessionIds.length) {
      const { data: overrides } = await supabase
        .from("attendance_overrides")
        .select("session_id")
        .eq("trainee_id", traineeId)
        .in("session_id", sessionIds);
      for (const o of overrides ?? []) overrideSessionIds.add(o.session_id);
    }
  } catch {
    // table may not exist yet
  }

  const completedTaskIds = new Set((completions ?? []).map((c) => c.task_id));
  const attBySession = new Map<string, { status: string; duration_mins: number; total_session_mins: number }>();
  for (const row of attendanceRows ?? []) {
    attBySession.set(row.session_id, row);
  }

  // Build week breakdown
  const weekMap = new Map<number, { lab_total: number; kc_total: number; lab_done: number; kc_done: number }>();
  for (const task of tasks ?? []) {
    const entry = weekMap.get(task.week_number) ?? { lab_total: 0, kc_total: 0, lab_done: 0, kc_done: 0 };
    if (task.task_type === "lab") {
      entry.lab_total++;
      if (completedTaskIds.has(task.id)) entry.lab_done++;
    } else if (task.task_type === "kc") {
      entry.kc_total++;
      if (completedTaskIds.has(task.id)) entry.kc_done++;
    }
    weekMap.set(task.week_number, entry);
  }

  const weekBreakdown = Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([week_number, counts]) => ({
      week_number,
      ...counts,
      is_pending: week_number > currentWeek,
    }));

  const attendanceSessions = (sessions ?? []).map((s) => {
    const row = attBySession.get(s.id);
    return {
      session_id: s.id,
      week_number: s.week_number,
      topic: s.topic,
      started_at: s.started_at,
      status: row?.status ?? "absent",
      duration_mins: row?.duration_mins ?? 0,
      total_mins: row?.total_session_mins ?? s.total_duration_mins,
      is_override: overrideSessionIds.has(s.id),
    };
  });

  const totals = {
    labs_done:         weekBreakdown.reduce((s, w) => s + w.lab_done, 0),
    labs_total:        weekBreakdown.reduce((s, w) => s + w.lab_total, 0),
    kcs_done:          weekBreakdown.reduce((s, w) => s + w.kc_done, 0),
    kcs_total:         weekBreakdown.reduce((s, w) => s + w.kc_total, 0),
    sessions_attended: attendanceSessions.filter((s) => s.status === "present").length,
    sessions_total:    attendanceSessions.length,
  };

  return {
    data: {
      trainee: {
        id: trainee.id,
        full_name: trainee.full_name,
        personal_email: trainee.personal_email,
        amalitech_email: trainee.amalitech_email,
        status: trainee.status,
        serial_no: trainee.serial_no,
      },
      weekBreakdown,
      attendanceSessions,
      totals,
    },
  };
}

export async function toggleAttendanceOverride(
  sessionId: string,
  traineeId: string,
  cohortId: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";

  if (!isSuperAdmin) {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .single();
    if (!access) return { error: "Access denied" };
  }

  const { data: existing } = await supabase
    .from("attendance_overrides")
    .select("id")
    .eq("session_id", sessionId)
    .eq("trainee_id", traineeId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("attendance_overrides")
      .delete()
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("attendance_overrides")
      .insert({ session_id: sessionId, trainee_id: traineeId, overridden_by: user.id });
    if (error) return { error: error.message };
  }

  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { success: true };
}
