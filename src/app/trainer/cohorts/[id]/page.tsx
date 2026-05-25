import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RosterUploadForm from "./RosterUploadForm";
import AddTraineeForm from "./AddTraineeForm";
import AutoRefresh from "@/components/AutoRefresh";
import TraineesTable from "./TraineesTable";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export default async function CohortTraineesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Parallel fetch of all independent queries ───────────────────────────────
  const [
    { data: cohort },
    { data: trainees },
    { data: cohortTasks },
    { data: summaryRows },
    { data: attendanceSummaryRows },
    { data: weekBreakdownRows },
  ] = await Promise.all([
    supabase.from("cohorts").select("level, has_index_numbers, start_date, training_weeks, code_name, name").eq("id", id).single(),
    supabase
      .from("trainees")
      .select("id, serial_no, full_name, personal_email, amalitech_email, status, user_id, graduated, deleted_at, temp_password, temp_password_changed_at")
      .eq("cohort_id", id)
      .order("serial_no", { ascending: true, nullsFirst: false }),
    supabase.from("cohort_week_tasks").select("task_type, week_number").eq("cohort_id", id),
    supabase.rpc("get_cohort_completion_summary", { p_cohort_id: id }),
    supabase.rpc("get_cohort_attendance_summary", { p_cohort_id: id }),
    supabase.rpc("get_cohort_completion_by_week", { p_cohort_id: id }),
  ]);

  // ── Presence (depends on trainees list) ────────────────────────────────────
  const userIds = (trainees ?? []).filter((t) => t.user_id).map((t) => t.user_id as string);
  const { data: presenceRows } = userIds.length
    ? await supabase.from("profiles").select("id, last_seen").in("id", userIds)
    : { data: [] };

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isPractitioner = cohort?.level === "practitioner";
  const isGraduatable  = !isPractitioner;

  // ── Task totals and per-week task counts ───────────────────────────────────
  const totalByType = { kc: 0, lab: 0, video: 0 };
  const weekTaskCountsMap = new Map<number, { kc: number; lab: number }>();

  for (const t of cohortTasks ?? []) {
    if (t.task_type === "kc")                            totalByType.kc++;
    else if (t.task_type === "lab")                      totalByType.lab++;
    else if (t.task_type === "video" && !isPractitioner) totalByType.video++;

    if (t.week_number != null && (t.task_type === "kc" || t.task_type === "lab")) {
      const entry = weekTaskCountsMap.get(t.week_number) ?? { kc: 0, lab: 0 };
      if (t.task_type === "kc") entry.kc++; else entry.lab++;
      weekTaskCountsMap.set(t.week_number, entry);
    }
  }

  const weekTaskCounts = Array.from(weekTaskCountsMap.entries())
    .map(([week_number, counts]) => ({ week_number, ...counts }))
    .sort((a, b) => a.week_number - b.week_number);

  const hasTasks = (totalByType.kc + totalByType.lab + totalByType.video) > 0;

  // ── Per-trainee overall progress ───────────────────────────────────────────
  const progressByTrainee: Record<string, { kc: number; lab: number; video: number }> = {};
  for (const row of summaryRows ?? []) {
    progressByTrainee[row.trainee_id] = {
      lab:   row.lab_count   ?? 0,
      kc:    row.kc_count    ?? 0,
      video: isPractitioner ? 0 : (row.video_count ?? 0),
    };
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  const totalSessions = (attendanceSummaryRows ?? [])[0]?.total_sessions ?? 0;
  const attendanceByTrainee: Record<string, number> = {};
  for (const r of attendanceSummaryRows ?? []) {
    attendanceByTrainee[r.trainee_id] = r.sessions_attended;
  }

  // ── Presence ───────────────────────────────────────────────────────────────
  const now = Date.now();
  const onlineUserIds: string[] = [];
  const lastSeenByUserId: Record<string, string | null> = {};
  for (const p of presenceRows ?? []) {
    lastSeenByUserId[p.id] = p.last_seen;
    if (p.last_seen && now - new Date(p.last_seen).getTime() < ONLINE_THRESHOLD_MS) {
      onlineUserIds.push(p.id);
    }
  }

  // ── Split live / deleted ───────────────────────────────────────────────────
  const liveTrainees    = (trainees ?? []).filter((t) => !t.deleted_at);
  const deletedTrainees = (trainees ?? []).filter((t) => !!t.deleted_at);

  const active         = liveTrainees.filter((t) => t.status === "active").length;
  const withAccount    = liveTrainees.filter((t) => t.user_id).length;
  const online         = onlineUserIds.length;
  const graduatedCount = liveTrainees.filter((t) => t.graduated).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <AutoRefresh intervalMs={30_000} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total trainees"   value={liveTrainees.length} />
        <StatCard label="Active"           value={active} />
        <StatCard label="Accounts created" value={withAccount} sub={online > 0 ? `${online} online now` : undefined} />
        <StatCard label="Graduated"        value={graduatedCount} sub={liveTrainees.length ? `of ${liveTrainees.length}` : undefined} accent="green" />
      </div>

      {/* Roster upload */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Upload roster</h2>
            <p className="text-xs text-slate-500">
              Download the template, fill it in, then upload it here.
            </p>
          </div>
          {!isPractitioner && <AddTraineeForm cohortId={id} />}
        </div>
        <RosterUploadForm
          cohortId={id}
          level={cohort?.level ?? "practitioner"}
          hasIndexNumbers={cohort?.has_index_numbers ?? false}
        />
      </div>

      {/* Trainees table (with week filter) */}
      <TraineesTable
        cohortId={id}
        cohortCodeName={cohort?.code_name ?? cohort?.name ?? ""}
        cohortStartDate={cohort?.start_date ?? new Date().toISOString()}
        cohortTrainingWeeks={cohort?.training_weeks ?? 12}
        liveTrainees={liveTrainees}
        deletedTrainees={deletedTrainees.map((t) => ({
          id: t.id,
          full_name: t.full_name,
          personal_email: t.personal_email,
          deleted_at: t.deleted_at!,
        }))}
        progressByTrainee={progressByTrainee}
        weekBreakdown={weekBreakdownRows ?? []}
        weekTaskCounts={weekTaskCounts}
        totalByType={totalByType}
        hasTasks={hasTasks}
        totalSessions={totalSessions}
        attendanceByTrainee={attendanceByTrainee}
        onlineUserIds={onlineUserIds}
        lastSeenByUserId={lastSeenByUserId}
        isPractitioner={isPractitioner}
        isGraduatable={isGraduatable}
      />
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: number; sub?: string; accent?: "green";
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent === "green" && value > 0 ? "text-green-600" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
