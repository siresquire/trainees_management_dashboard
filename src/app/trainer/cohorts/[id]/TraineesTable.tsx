"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import GraduationToggle from "./GraduationToggle";
import ResendInviteButton from "./ResendInviteButton";
import RefreshButton from "./RefreshButton";

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

// ── Main component ────────────────────────────────────────────────────────────

export default function TraineesTable({
  cohortId,
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

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  // Sorted list of weeks that have KC or Lab tasks
  const availableWeeks = useMemo(
    () => weekTaskCounts.map((w) => w.week_number).sort((a, b) => a - b),
    [weekTaskCounts]
  );

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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Table header */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Trainees{" "}
            <span className="text-slate-400 font-normal">({liveTrainees.length})</span>
          </h2>
          <RefreshButton />
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

      {!liveTrainees.length ? (
        <div className="py-12 text-center text-sm text-slate-400">
          No trainees yet — upload a roster above or sync from Canvas.
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Sessions</th>
                )}
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Graduated</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liveTrainees.map((t) => {
                const progress = filteredProgressByTrainee[t.id] ?? { kc: 0, lab: 0, video: 0 };
                const online   = !!t.user_id && onlineSet.has(t.user_id);
                const lastSeen = t.user_id ? (lastSeenByUserId[t.user_id] ?? null) : null;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400 text-xs">{t.serial_no ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/trainer/cohorts/${cohortId}/trainees/${t.id}`}
                        className="hover:text-orange-600 transition-colors"
                      >
                        {t.full_name}
                      </Link>
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
                        <SessionsCell
                          attended={attendanceByTrainee[t.id] ?? 0}
                          total={totalSessions}
                        />
                      </td>
                    )}

                    <td className="px-4 py-3">
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

                    <td className="px-4 py-3">
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

// ── Sessions cell ─────────────────────────────────────────────────────────────

function SessionsCell({ attended, total }: { attended: number; total: number }) {
  const pct   = total > 0 ? attended / total : 0;
  const color = pct >= 0.75 ? "text-green-600" : pct >= 0.5 ? "text-amber-600" : "text-red-600";
  return (
    <span className={`text-xs font-medium tabular-nums ${color}`}>
      {attended}<span className="text-slate-300 font-normal">/{total}</span>
    </span>
  );
}
