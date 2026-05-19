"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import GraduationToggle from "./GraduationToggle";
import ResendInviteButton from "./ResendInviteButton";
import RefreshButton from "./RefreshButton";
import { getTraineeDetail, toggleAttendanceOverride } from "@/actions/trainee-detail";
import type { TraineeDetailData } from "@/actions/trainee-detail";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trainee = {
  id: string;
  serial_no: number | null;
  full_name: string;
  personal_email: string;
  amalitech_email: string | null;
  status: string;
  user_id: string | null;
  graduated: boolean;
};

type ProgressCounts = { kc: number; lab: number; video: number };

type WeekBreakdownRow = {
  trainee_id: string;
  week_number: number;
  lab_count: number;
  kc_count: number;
};

type WeekTaskCount = { week_number: number; kc: number; lab: number };

type Props = {
  cohortId: string;
  cohortStartDate: string;
  cohortTrainingWeeks: number;
  liveTrainees: Trainee[];
  progressByTrainee: Record<string, ProgressCounts>;
  weekBreakdown: WeekBreakdownRow[];
  weekTaskCounts: WeekTaskCount[];
  totalByType: ProgressCounts;
  hasTasks: boolean;
  totalSessions: number;
  attendanceByTrainee: Record<string, number>;
  onlineUserIds: string[];
  lastSeenByUserId: Record<string, string | null>;
  isPractitioner: boolean;
  isGraduatable: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  dropped:   "bg-red-100 text-red-700",
  suspended: "bg-amber-100 text-amber-700",
};

const PROGRESS_CONFIG = [
  { key: "lab"   as const, label: "Lab",   barFull: "bg-emerald-500", barPart: "bg-emerald-300" },
  { key: "kc"    as const, label: "KC",    barFull: "bg-blue-500",    barPart: "bg-blue-300"    },
  { key: "video" as const, label: "Video", barFull: "bg-purple-500",  barPart: "bg-purple-300"  },
];

const ATT_STATUS_BADGE: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  brief:   "bg-slate-100 text-slate-600",
  absent:  "bg-red-100 text-red-700",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function TraineesTable({
  cohortId,
  cohortStartDate: _cohortStartDate,
  cohortTrainingWeeks: _cohortTrainingWeeks,
  liveTrainees,
  progressByTrainee,
  weekBreakdown,
  weekTaskCounts,
  totalByType,
  hasTasks,
  totalSessions,
  attendanceByTrainee,
  onlineUserIds,
  lastSeenByUserId,
  isPractitioner,
  isGraduatable,
}: Props) {
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [searchQuery,   setSearchQuery]   = useState("");

  // Detail pane state
  const [detailTraineeId, setDetailTraineeId] = useState<string | null>(null);
  const [detailData,      setDetailData]      = useState<TraineeDetailData | null>(null);
  const [detailLoading,   setDetailLoading]   = useState(false);
  const [detailError,     setDetailError]     = useState("");
  const [detailView,      setDetailView]      = useState<"overview" | "labs" | "kcs" | "attendance">("overview");

  const [isPending, startTransition] = useTransition();

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  // Sorted list of weeks that have KC or Lab tasks
  const availableWeeks = useMemo(
    () => weekTaskCounts.map((w) => w.week_number).sort((a, b) => a - b),
    [weekTaskCounts]
  );

  // Search-filtered trainees
  const filteredTrainees = useMemo(() => {
    if (!searchQuery.trim()) return liveTrainees;
    const q = searchQuery.toLowerCase();
    return liveTrainees.filter((t) => t.full_name.toLowerCase().includes(q));
  }, [liveTrainees, searchQuery]);

  // Filtered task totals (denominator changes when weeks are selected)
  const filteredTotals = useMemo<ProgressCounts>(() => {
    if (selectedWeeks.length === 0) return totalByType;
    return weekTaskCounts
      .filter((w) => selectedWeeks.includes(w.week_number))
      .reduce(
        (acc, w) => ({ kc: acc.kc + w.kc, lab: acc.lab + w.lab, video: 0 }),
        { kc: 0, lab: 0, video: 0 }
      );
  }, [selectedWeeks, weekTaskCounts, totalByType]);

  // Filtered per-trainee completion counts (numerator)
  const filteredProgressByTrainee = useMemo<Record<string, ProgressCounts>>(() => {
    if (selectedWeeks.length === 0) return progressByTrainee;
    const result: Record<string, ProgressCounts> = {};
    for (const row of weekBreakdown) {
      if (!selectedWeeks.includes(row.week_number)) continue;
      const prev = result[row.trainee_id] ?? { kc: 0, lab: 0, video: 0 };
      result[row.trainee_id] = {
        kc:    prev.kc    + row.kc_count,
        lab:   prev.lab   + row.lab_count,
        video: 0,
      };
    }
    return result;
  }, [selectedWeeks, weekBreakdown, progressByTrainee]);

  function toggleWeek(week: number) {
    setSelectedWeeks((prev) =>
      prev.includes(week) ? prev.filter((w) => w !== week) : [...prev, week]
    );
  }

  const showWeekFilter = hasTasks && availableWeeks.length > 0;

  // Fetch detail data when a trainee is selected
  useEffect(() => {
    if (!detailTraineeId) {
      setDetailData(null);
      setDetailError("");
      setDetailView("overview");
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    setDetailData(null);
    setDetailView("overview");
    getTraineeDetail(detailTraineeId, cohortId).then((res) => {
      if (res.error) setDetailError(res.error);
      else if (res.data) setDetailData(res.data);
      setDetailLoading(false);
    });
  }, [detailTraineeId, cohortId]);

  function handleToggleOverride(sessionId: string, traineeId: string) {
    startTransition(async () => {
      await toggleAttendanceOverride(sessionId, traineeId, cohortId);
      const res = await getTraineeDetail(traineeId, cohortId);
      if (res.data) setDetailData(res.data);
    });
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Table header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Trainees{" "}
              <span className="text-slate-400 font-normal">({filteredTrainees.length})</span>
            </h2>
            <RefreshButton />
          </div>

          {/* Search bar */}
          <div className="mb-3">
            <input
              type="search"
              placeholder="Search by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400"
            />
          </div>

          {/* Week filter pills */}
          {showWeekFilter && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 shrink-0">Filter by week:</span>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedWeeks([])}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedWeeks.length === 0
                      ? "bg-purple-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All
                </button>
                {availableWeeks.map((w) => (
                  <button
                    key={w}
                    onClick={() => toggleWeek(w)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedWeeks.includes(w)
                        ? "bg-purple-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Wk {w}
                  </button>
                ))}
              </div>
              {selectedWeeks.length > 0 && (
                <span className="text-xs text-slate-400">
                  — showing wk {[...selectedWeeks].sort((a,b)=>a-b).join(", ")} only
                </span>
              )}
            </div>
          )}
        </div>

        {!filteredTrainees.length ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {liveTrainees.length === 0
              ? "No trainees yet — upload a roster above or sync from Canvas."
              : "No trainees match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-12">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Personal email</th>
                  {!isPractitioner && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Amalitech email</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                  {hasTasks && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 min-w-[140px]">
                      {selectedWeeks.length > 0 ? `Progress (wk ${[...selectedWeeks].sort((a,b)=>a-b).join("+")})` : "Progress"}
                    </th>
                  )}
                  {totalSessions > 0 && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Attendance</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Graduated</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrainees.map((t) => {
                  const progress = filteredProgressByTrainee[t.id] ?? { kc: 0, lab: 0, video: 0 };
                  const online   = !!t.user_id && onlineSet.has(t.user_id);
                  const lastSeen = t.user_id ? (lastSeenByUserId[t.user_id] ?? null) : null;
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-orange-50 cursor-pointer transition-colors"
                      onClick={() => setDetailTraineeId(t.id)}
                      title="Click to view trainee details"
                    >
                      <td className="px-4 py-3 text-slate-400 text-xs">{t.serial_no ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 hover:text-orange-600 transition-colors">
                        {t.full_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.personal_email}</td>
                      {!isPractitioner && (
                        <td className="px-4 py-3 text-slate-600">{t.amalitech_email ?? "—"}</td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            STATUS_BADGE[t.status] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>

                      {hasTasks && (
                        <td className="px-4 py-3">
                          <ProgressCell progress={progress} totals={filteredTotals} />
                        </td>
                      )}

                      {totalSessions > 0 && (
                        <td className="px-4 py-3">
                          <AttendanceCell
                            attended={attendanceByTrainee[t.id] ?? 0}
                            total={totalSessions}
                          />
                        </td>
                      )}

                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {!isGraduatable ? (
                          t.graduated ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
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

                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <AccountCell
                          traineeId={t.id}
                          cohortId={cohortId}
                          userId={t.user_id ?? null}
                          lastSeen={lastSeen}
                          online={online}
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

      {/* Detail slide-over pane */}
      {detailTraineeId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setDetailTraineeId(null)}
          />

          {/* Pane */}
          <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {detailData?.trainee.full_name ?? "Loading…"}
                </h2>
                {detailData && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {detailData.trainee.amalitech_email ?? detailData.trainee.personal_email}
                    <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full capitalize ${STATUS_BADGE[detailData.trainee.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {detailData.trainee.status}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setDetailTraineeId(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors ml-4 shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailLoading && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-400">Loading…</p>
              </div>
            )}

            {detailError && (
              <div className="flex-1 flex items-center justify-center px-6">
                <p className="text-sm text-red-600">{detailError}</p>
              </div>
            )}

            {detailData && (
              <div className="flex-1 overflow-y-auto">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-slate-100">
                  <button
                    onClick={() => setDetailView("labs")}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${detailView === "labs" ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Labs</p>
                    <p className="text-lg font-bold text-emerald-600 mt-0.5">
                      {detailData.totals.labs_done}
                      <span className="text-sm font-normal text-slate-400">/{detailData.totals.labs_total}</span>
                    </p>
                  </button>
                  <button
                    onClick={() => setDetailView("kcs")}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${detailView === "kcs" ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">KCs</p>
                    <p className="text-lg font-bold text-blue-600 mt-0.5">
                      {detailData.totals.kcs_done}
                      <span className="text-sm font-normal text-slate-400">/{detailData.totals.kcs_total}</span>
                    </p>
                  </button>
                  <button
                    onClick={() => setDetailView("attendance")}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${detailView === "attendance" ? "border-purple-400 bg-purple-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Attendance</p>
                    <p className="text-lg font-bold text-purple-600 mt-0.5">
                      {detailData.totals.sessions_attended}
                      <span className="text-sm font-normal text-slate-400">/{detailData.totals.sessions_total}</span>
                    </p>
                  </button>
                </div>

                {/* View nav */}
                <div className="flex gap-1 px-6 py-3 border-b border-slate-100">
                  {(["overview", "labs", "kcs", "attendance"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setDetailView(v)}
                      className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${detailView === v ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <div className="px-6 py-4">
                  {/* Overview */}
                  {detailView === "overview" && (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-500">
                        Serial: <span className="font-medium text-slate-700">{detailData.trainee.serial_no ?? "—"}</span>
                        <span className="mx-2">·</span>
                        Personal email: <span className="font-medium text-slate-700">{detailData.trainee.personal_email}</span>
                      </p>

                      {/* Mini attendance list */}
                      {detailData.attendanceSessions.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-700 mb-2">Recent sessions</h3>
                          <div className="space-y-1">
                            {detailData.attendanceSessions.slice(0, 5).map((s) => (
                              <div key={s.session_id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 truncate flex-1">{s.topic}</span>
                                <span className={`ml-2 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${ATT_STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-600"}`}>
                                  {s.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Labs view */}
                  {detailView === "labs" && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 mb-3">Labs by week</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 text-xs font-medium text-slate-500">Week</th>
                            <th className="text-right py-2 text-xs font-medium text-slate-500">Done</th>
                            <th className="text-right py-2 text-xs font-medium text-slate-500">Total</th>
                            <th className="text-right py-2 text-xs font-medium text-slate-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {detailData.weekBreakdown.filter((w) => w.lab_total > 0).map((w) => (
                            <tr key={w.week_number} className="hover:bg-slate-50">
                              <td className="py-2 text-slate-700">Week {w.week_number}</td>
                              <td className="py-2 text-right tabular-nums text-emerald-600 font-medium">{w.lab_done}</td>
                              <td className="py-2 text-right tabular-nums text-slate-400">{w.lab_total}</td>
                              <td className="py-2 text-right">
                                {w.is_pending ? (
                                  <span className="text-slate-400 text-xs">Upcoming</span>
                                ) : w.lab_done >= w.lab_total ? (
                                  <span className="text-green-600 text-xs font-medium">Done</span>
                                ) : (
                                  <span className="text-amber-600 text-xs">{w.lab_done}/{w.lab_total}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* KCs view */}
                  {detailView === "kcs" && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 mb-3">KCs by week</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 text-xs font-medium text-slate-500">Week</th>
                            <th className="text-right py-2 text-xs font-medium text-slate-500">Done</th>
                            <th className="text-right py-2 text-xs font-medium text-slate-500">Total</th>
                            <th className="text-right py-2 text-xs font-medium text-slate-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {detailData.weekBreakdown.filter((w) => w.kc_total > 0).map((w) => (
                            <tr key={w.week_number} className="hover:bg-slate-50">
                              <td className="py-2 text-slate-700">Week {w.week_number}</td>
                              <td className="py-2 text-right tabular-nums text-blue-600 font-medium">{w.kc_done}</td>
                              <td className="py-2 text-right tabular-nums text-slate-400">{w.kc_total}</td>
                              <td className="py-2 text-right">
                                {w.is_pending ? (
                                  <span className="text-slate-400 text-xs">Upcoming</span>
                                ) : w.kc_done >= w.kc_total ? (
                                  <span className="text-green-600 text-xs font-medium">Done</span>
                                ) : (
                                  <span className="text-amber-600 text-xs">{w.kc_done}/{w.kc_total}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Attendance view */}
                  {detailView === "attendance" && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 mb-3">Sessions</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-2 text-xs font-medium text-slate-500">Wk</th>
                              <th className="text-left py-2 text-xs font-medium text-slate-500">Session</th>
                              <th className="text-left py-2 text-xs font-medium text-slate-500">Date</th>
                              <th className="text-right py-2 text-xs font-medium text-slate-500">Status</th>
                              <th className="text-right py-2 text-xs font-medium text-slate-500">Min</th>
                              <th className="text-right py-2 text-xs font-medium text-slate-500">Override</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {detailData.attendanceSessions.map((s) => (
                              <tr key={s.session_id} className="hover:bg-slate-50">
                                <td className="py-2 text-slate-500 text-xs">{s.week_number ?? "—"}</td>
                                <td className="py-2 text-slate-700 text-xs max-w-[120px] truncate">{s.topic}</td>
                                <td className="py-2 text-slate-500 text-xs whitespace-nowrap">
                                  {new Date(s.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </td>
                                <td className="py-2 text-right">
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ATT_STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-600"}`}>
                                    {s.status}
                                  </span>
                                </td>
                                <td className="py-2 text-right tabular-nums text-xs text-slate-500">
                                  {s.duration_mins}/{s.total_mins}
                                </td>
                                <td className="py-2 text-right">
                                  {s.is_override ? (
                                    <button
                                      onClick={() => handleToggleOverride(s.session_id, detailTraineeId!)}
                                      disabled={isPending}
                                      className="text-[10px] font-medium text-green-600 hover:text-green-700 bg-green-50 px-1.5 py-0.5 rounded disabled:opacity-50"
                                    >
                                      Excused
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleToggleOverride(s.session_id, detailTraineeId!)}
                                      disabled={isPending}
                                      className="text-[10px] font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded disabled:opacity-50"
                                    >
                                      Excuse
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3">
                        Excused absences are counted as Present in the Admin export only.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── Progress cell ─────────────────────────────────────────────────────────────

function ProgressCell({ progress, totals }: { progress: ProgressCounts; totals: ProgressCounts }) {
  const items = PROGRESS_CONFIG.filter(({ key }) => totals[key] > 0);
  if (!items.length) return <span className="text-xs text-slate-300">—</span>;

  return (
    <div className="space-y-1.5 py-0.5">
      {items.map(({ key, label, barFull, barPart }) => {
        const done   = progress[key];
        const total  = totals[key];
        const pct    = total > 0 ? done / total : 0;
        const allDone = done >= total;

        const countColor = allDone ? "text-green-600" : pct >= 0.5 ? "text-amber-600" : "text-slate-500";
        const barColor   = allDone ? barFull : barPart;

        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400 w-7 flex-shrink-0">{label}</span>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
              <div
                className={`h-full rounded-full ${barColor} transition-all`}
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
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

// ── Attendance cell ───────────────────────────────────────────────────────────

function AttendanceCell({ attended, total }: { attended: number; total: number }) {
  const pct   = total > 0 ? attended / total : 0;
  const color = pct >= 0.75 ? "text-green-600" : pct >= 0.5 ? "text-amber-600" : "text-red-600";
  return (
    <span className={`text-xs font-medium tabular-nums ${color}`}>
      {attended}<span className="text-slate-300 font-normal">/{total}</span>
    </span>
  );
}
