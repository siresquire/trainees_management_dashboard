import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import RosterUploadForm from "./RosterUploadForm";
import ResendInviteButton from "./ResendInviteButton";
import AutoRefresh from "@/components/AutoRefresh";
import RefreshButton from "./RefreshButton";
import GraduationToggle from "./GraduationToggle";

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  dropped:   "bg-red-100 text-red-700",
  suspended: "bg-amber-100 text-amber-700",
};

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

type ProgressCounts = { kc: number; lab: number; video: number };

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

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, has_index_numbers")
    .eq("id", id)
    .single();

  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, serial_no, full_name, personal_email, amalitech_email, status, user_id, graduated, deleted_at")
    .eq("cohort_id", id)
    .order("serial_no", { ascending: true, nullsFirst: false });

  // Fetch last_seen for trainees who have accounts
  const userIds = (trainees ?? []).filter((t) => t.user_id).map((t) => t.user_id as string);
  const { data: presenceRows } = userIds.length
    ? await supabase.from("profiles").select("id, last_seen").in("id", userIds)
    : { data: [] };

  const now = Date.now();
  const lastSeenMap = new Map<string, string | null>(
    (presenceRows ?? []).map((p) => [p.id, p.last_seen])
  );
  const onlineSet = new Set<string>(
    Array.from(lastSeenMap.entries())
      .filter(([, ls]) => ls && now - new Date(ls).getTime() < ONLINE_THRESHOLD_MS)
      .map(([uid]) => uid)
  );

  // ── Progress data (all cohort levels) ────────────────────────────────────
  // isGraduatable = manual graduation toggle is shown (Associate/NSP).
  // Practitioner graduation is Canvas-synced — shown as a static badge.
  // Progress column (Lab/KC) is shown for ALL cohort levels with tasks.
  // Video is excluded from Practitioner totals (Canvas has no video tasks).
  const isPractitioner = cohort?.level === "practitioner";
  const isGraduatable  = !isPractitioner;

  let totalByType: ProgressCounts = { kc: 0, lab: 0, video: 0 };
  const traineeProgressMap = new Map<string, ProgressCounts>();

  // ── Totals: one small query, no pagination issues ─────────────────────
  const { data: cohortTasks } = await supabase
    .from("cohort_week_tasks")
    .select("task_type")
    .eq("cohort_id", id);

  for (const t of cohortTasks ?? []) {
    if (t.task_type === "kc")                          totalByType.kc++;
    else if (t.task_type === "lab")                    totalByType.lab++;
    else if (t.task_type === "video" && !isPractitioner) totalByType.video++;
  }

  // ── Per-trainee counts via aggregating RPC ────────────────────────────
  // Avoids the PostgREST max_rows=1000 cap: the function runs a GROUP BY
  // server-side and returns one row per trainee instead of one per completion.
  const { data: summaryRows } = await supabase
    .rpc("get_cohort_completion_summary", { p_cohort_id: id });

  for (const row of summaryRows ?? []) {
    traineeProgressMap.set(row.trainee_id, {
      lab:   row.lab_count   ?? 0,
      kc:    row.kc_count    ?? 0,
      video: isPractitioner ? 0 : (row.video_count ?? 0),
    });
  }

  const hasTasks = (totalByType.kc + totalByType.lab + totalByType.video) > 0;

  // ── Attendance summary (X/Y sessions) ────────────────────────────────────
  const { data: attendanceSummaryRows } = await supabase
    .rpc("get_cohort_attendance_summary", { p_cohort_id: id });

  // total sessions is the same for every row; grab from first row
  const totalSessions = (attendanceSummaryRows ?? [])[0]?.total_sessions ?? 0;
  const attendanceSummaryMap = new Map<string, number>(
    (attendanceSummaryRows ?? []).map((r: { trainee_id: string; sessions_attended: number }) => [r.trainee_id, r.sessions_attended])
  );

  // ── Split into active and deleted ────────────────────────────────────────
  const liveTrainees    = (trainees ?? []).filter((t) => !t.deleted_at);
  const deletedTrainees = (trainees ?? []).filter((t) => !!t.deleted_at);

  const active         = liveTrainees.filter((t) => t.status === "active").length;
  const withAccount    = liveTrainees.filter((t) => t.user_id).length;
  const online         = onlineSet.size;
  const graduatedCount = liveTrainees.filter((t) => t.graduated).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <AutoRefresh intervalMs={30_000} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total trainees" value={liveTrainees.length} />
        <StatCard label="Active"          value={active} />
        <StatCard label="Accounts created" value={withAccount} sub={online > 0 ? `${online} online now` : undefined} />
        <StatCard label="Graduated" value={graduatedCount} sub={liveTrainees.length ? `of ${liveTrainees.length}` : undefined} accent="green" />
      </div>

      {/* Roster upload */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Upload roster</h2>
        <p className="text-xs text-slate-500 mb-4">
          Download the template, fill it in, then upload it here.
        </p>
        <RosterUploadForm
          cohortId={id}
          level={cohort?.level ?? "practitioner"}
          hasIndexNumbers={cohort?.has_index_numbers ?? false}
        />
      </div>

      {/* Trainee table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Trainees{" "}
            <span className="text-slate-400 font-normal">({liveTrainees.length})</span>
          </h2>
          <RefreshButton />
        </div>

        {!liveTrainees.length ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No trainees yet — upload a roster above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-12">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Personal email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Amalitech email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                  {hasTasks && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 min-w-[140px]">
                      Progress
                    </th>
                  )}
                  {totalSessions > 0 && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Sessions</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Graduated</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liveTrainees.map((t) => {
                  const progress = traineeProgressMap.get(t.id) ?? { kc: 0, lab: 0, video: 0 };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-400 text-xs">{t.serial_no ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link href={`/trainer/cohorts/${id}/trainees/${t.id}`} className="hover:text-orange-600 transition-colors">
                          {t.full_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.personal_email}</td>
                      <td className="px-4 py-3 text-slate-600">{t.amalitech_email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[t.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {t.status}
                        </span>
                      </td>

                      {hasTasks && (
                        <td className="px-4 py-3">
                          <ProgressCell progress={progress} totals={totalByType} />
                        </td>
                      )}

                      {totalSessions > 0 && (
                        <td className="px-4 py-3">
                          <SessionsCell
                            attended={attendanceSummaryMap.get(t.id) ?? 0}
                            total={totalSessions}
                          />
                        </td>
                      )}

                      <td className="px-4 py-3">
                        {!isGraduatable ? (
                          t.graduated ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Graduated
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )
                        ) : (
                          <GraduationToggle traineeId={t.id} graduated={t.graduated} />
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <AccountCell
                          traineeId={t.id}
                          cohortId={id}
                          userId={t.user_id ?? null}
                          lastSeen={t.user_id ? (lastSeenMap.get(t.user_id) ?? null) : null}
                          online={!!t.user_id && onlineSet.has(t.user_id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deleted trainees section */}
      {deletedTrainees.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-200 bg-red-50">
            <h2 className="text-sm font-semibold text-red-700">
              Deleted trainees{" "}
              <span className="font-normal text-red-400">({deletedTrainees.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Deleted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deletedTrainees.map((t) => (
                  <tr key={t.id} className="opacity-60">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      <Link href={`/trainer/cohorts/${id}/trainees/${t.id}`} className="hover:text-orange-600 transition-colors">
                        {t.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{t.personal_email}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(t.deleted_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/trainer/cohorts/${id}/trainees/${t.id}`} className="text-xs text-slate-400 hover:text-orange-600 transition-colors">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress cell ─────────────────────────────────────────────────────────────

const PROGRESS_CONFIG = [
  { key: "lab"   as const, label: "Lab",   barFull: "bg-emerald-500", barPart: "bg-emerald-300" },
  { key: "kc"    as const, label: "KC",    barFull: "bg-blue-500",    barPart: "bg-blue-300"    },
  { key: "video" as const, label: "Video", barFull: "bg-purple-500",  barPart: "bg-purple-300"  },
];

function ProgressCell({
  progress,
  totals,
}: {
  progress: ProgressCounts;
  totals:   ProgressCounts;
}) {
  const items = PROGRESS_CONFIG.filter(({ key }) => totals[key] > 0);

  if (!items.length) {
    return <span className="text-xs text-slate-300">—</span>;
  }

  return (
    <div className="space-y-1.5 py-0.5">
      {items.map(({ key, label, barFull, barPart }) => {
        const done  = progress[key];
        const total = totals[key];
        const pct   = total > 0 ? done / total : 0;
        const allDone = done >= total;

        const countColor = allDone
          ? "text-green-600"
          : pct >= 0.5
          ? "text-amber-600"
          : "text-slate-500";

        const barColor = allDone ? barFull : barPart;

        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400 w-7 flex-shrink-0">
              {label}
            </span>
            {/* Mini progress bar */}
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
              <div
                className={`h-full rounded-full ${barColor} transition-all`}
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
            {/* Fraction */}
            <span className={`text-xs font-medium tabular-nums ${countColor}`}>
              {done}<span className="text-slate-300 font-normal">/{total}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Account cell ──────────────────────────────────────────────────────────────

function AccountCell({
  traineeId, cohortId, userId, lastSeen, online,
}: {
  traineeId: string; cohortId: string; userId: string | null;
  lastSeen: string | null; online: boolean;
}) {
  if (!userId) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">No account</span>
        <ResendInviteButton traineeId={traineeId} cohortId={cohortId} label="Send invite" />
      </div>
    );
  }
  if (lastSeen === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-600 font-medium">Invited</span>
        <ResendInviteButton traineeId={traineeId} cohortId={cohortId} label="Resend" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? "bg-green-500" : "bg-slate-300"}`} />
      <span className={`text-xs font-medium ${online ? "text-green-600" : "text-slate-500"}`}>
        {online ? "Online" : "Offline"}
      </span>
    </div>
  );
}

// ── Sessions cell ─────────────────────────────────────────────────────────────

function SessionsCell({ attended, total }: { attended: number; total: number }) {
  const pct  = total > 0 ? attended / total : 0;
  const color = pct >= 0.75 ? "text-green-600" : pct >= 0.5 ? "text-amber-600" : "text-red-600";
  return (
    <span className={`text-xs font-medium tabular-nums ${color}`}>
      {attended}<span className="text-slate-300 font-normal">/{total}</span>
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: "green" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent === "green" && value > 0 ? "text-green-600" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
