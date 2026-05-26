import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SessionsClient from "./SessionsClient";

export default async function ProSkillsSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: sessions }, { data: trainees }] = await Promise.all([
    supabase
      .from("pro_skills_sessions")
      .select("id, title, session_date, topic, created_at, instructor_id")
      .eq("cohort_id", id)
      .order("session_date", { ascending: false }),
    supabase
      .from("trainees")
      .select("id, full_name, personal_email, amalitech_email")
      .eq("cohort_id", id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: attendance } = sessionIds.length
    ? await supabase
        .from("pro_skills_attendance")
        .select("session_id, trainee_id, status")
        .in("session_id", sessionIds)
    : { data: [] as { session_id: string; trainee_id: string; status: string }[] };

  return (
    <SessionsClient
      cohortId={id}
      sessions={sessions ?? []}
      trainees={trainees ?? []}
      attendance={attendance ?? []}
    />
  );
}
