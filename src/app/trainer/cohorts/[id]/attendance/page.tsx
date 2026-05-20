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

  const [{ data: cohort }, { data: trainees }, { data: sessions }] = await Promise.all([
    supabase.from("cohorts").select("level, attendance_present_pct, attendance_partial_pct").eq("id", id).single(),
    supabase.from("trainees").select("id, serial_no, full_name, personal_email, amalitech_email").eq("cohort_id", id).is("deleted_at", null).eq("status", "active").order("serial_no", { ascending: true, nullsFirst: false }),
    supabase.from("sessions").select("id, platform, topic, started_at, total_duration_mins, week_number, session_number, created_at").eq("cohort_id", id).order("started_at", { ascending: false }),
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
      presentPct={cohort?.attendance_present_pct ?? 75}
      partialPct={cohort?.attendance_partial_pct  ?? 50}
      trainees={trainees ?? []}
      sessions={(sessions ?? []).map((s) => ({
        ...s,
        platform: s.platform as "zoom" | "teams",
      }))}
      attendance={attendance ?? []}
    />
  );
}
