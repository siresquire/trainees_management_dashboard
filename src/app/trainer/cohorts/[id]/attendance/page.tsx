import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AttendanceClient from "./AttendanceClient";

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  type SessionWithUnmatched = { id: string; platform: string; topic: string | null; started_at: string; total_duration_mins: number; week_number: number | null; session_number: number | null; created_at: string; unmatched_participants: { name: string; email: string; duration_mins: number }[] };
  const [{ data: cohort }, { data: trainees }, { data: sessions }] = await Promise.all([
    supabase.from("cohorts").select("level, present_threshold_mins, partial_threshold_mins").eq("id", id).single(),
    supabase.from("trainees").select("id, serial_no, full_name, personal_email, amalitech_email").eq("cohort_id", id).is("deleted_at", null).eq("status", "active").order("serial_no", { ascending: true, nullsFirst: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("sessions").select("id, platform, topic, started_at, total_duration_mins, week_number, session_number, created_at, unmatched_participants").eq("cohort_id", id).order("started_at", { ascending: false }) as Promise<{ data: { id: string; platform: string; topic: string | null; started_at: string; total_duration_mins: number; week_number: number | null; session_number: number | null; created_at: string; unmatched_participants: { name: string; email: string; duration_mins: number }[] }[] | null; error: unknown }>,
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  const { data: attendance } = sessionIds.length
    ? await supabase
        .from("attendance")
        .select("id, session_id, trainee_id, duration_mins, total_session_mins, attendance_pct, status")
        .in("session_id", sessionIds)
    : { data: [] };

  return (
    <AttendanceClient
      cohortId={id}
      cohortLevel={cohort?.level ?? "practitioner"}
      presentMins={(cohort as Record<string, unknown>)?.present_threshold_mins as number ?? 45}
      partialMins={(cohort as Record<string, unknown>)?.partial_threshold_mins  as number ?? 25}
      trainees={trainees ?? []}
      sessions={((sessions ?? []) as SessionWithUnmatched[]).map((s) => ({
        ...s,
        platform: s.platform as "zoom" | "teams",
        unmatched_participants: s.unmatched_participants ?? [],
      }))}
      attendance={attendance ?? []}
    />
  );
}
