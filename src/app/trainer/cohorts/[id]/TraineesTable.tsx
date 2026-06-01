"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import GraduationToggle from "./GraduationToggle";
import ResendInviteButton from "./ResendInviteButton";
import RefreshButton from "./RefreshButton";
import { getTraineeDetail, toggleAttendanceOverride } from "@/actions/trainee-detail";
import type { TraineeDetailData } from "@/actions/trainee-detail";
import { setTraineeTempPassword, softDeleteTrainee, restoreTrainee } from "@/actions/trainees";
import { toast } from "@/lib/toast";

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
  temp_password: string | null;
  temp_password_changed_at: string | null;
};

function toTitleCase(str: string): string {
  return str.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

type ProgressCounts = { kc: number; lab: number; video: number };

type WeekBreakdownRow = {
  trainee_id: string;
  week_number: number;
  lab_count: number;
  kc_count: number;
};

type WeekTaskCount = { week_number: number; kc: number; lab: number };

type DeletedTrainee = {
  id: string;
  full_name: string;
  personal_email: string;
  deleted_at: string;
};

type Props = {
  cohortId: string;
  cohortCodeName: string;
  cohortStartDate: string;
  cohortTrainingWeeks: number;
  liveTrainees: Trainee[];
  deletedTrainees: DeletedTrainee[];
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

function downloadCsv(rows: string[][], filename: string) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export default function TraineesTable({
  cohortId,
  cohortCodeName,
  cohortStartDate: _cohortStartDate,
  cohortTrainingWeeks: _cohortTrainingWeeks,
  liveTrainees,
  deletedTrainees,
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
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [searchQuery,   setSearchQuery]   = useState("");

  // Detail pane state
  const [detailTraineeId, setDetailTraineeId] = useState<string | null>(null);
  const [detailData,      setDetailData]      = useState<TraineeDetailData | null>(null);
  const [detailLoading,   setDetailLoading]   = useState(false);
  const [detailError,     setDetailError]     = useState("");
  const [detailView,      setDetailView]      = useState<"overview" | "labs" | "kcs" | "attendance">("overview");

  const [isPending, startTransition] = useTransition();

  // Sort state
  type SortKey = "serial" | "name" | "email" | "status" | "lab" | "kc" | "attendance" | "graduated";
  const [sortKey, setSortKey] = useState<SortKey>("serial");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Delete / restore state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const router = useRouter();

  // Temp password mode (bulk)
  const [tempPassMode,      setTempPassMode]      = useState(false);
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());
  const [isGenerating,      setIsGenerating]      = useState(false);
  const [passResults,       setPassResults]       = useState<{ id: string; name: string; password?: string; error?: string }[]>([]);
  const [showPassResults,   setShowPassResults]   = useState(false);
  const [showPassIds,       setShowPassIds]       = useState<Set<string>>(new Set());
  const [copiedId,          setCopiedId]          = useState<string | null>(null);

  // Per-trainee password reset inside the detail pane
  const [paneResetLoading,  setPaneResetLoading]  = useState(false);
  const [paneResetPassword, setPaneResetPassword] = useState<string | null>(null);
  const [paneResetError,    setPaneResetError]    = useState("");
  const [paneResetCopied,   setPaneResetCopied]   = useState(false);

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

  const sortedTrainees = useMemo(() => {
    const arr = [...filteredTrainees];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "serial":     cmp = (a.serial_no ?? 999999) - (b.serial_no ?? 999999); break;
        case "name":       cmp = a.full_name.localeCompare(b.full_name); break;
        case "email":      cmp = a.personal_email.localeCompare(b.personal_email); break;
        case "status":     cmp = a.status.localeCompare(b.status); break;
        case "lab": { const pa = filteredProgressByTrainee[a.id] ?? {lab:0,kc:0,video:0}; const pb = filteredProgressByTrainee[b.id] ?? {lab:0,kc:0,video:0}; cmp = pa.lab - pb.lab; break; }
        case "kc":  { const pa = filteredProgressByTrainee[a.id] ?? {lab:0,kc:0,video:0}; const pb = filteredProgressByTrainee[b.id] ?? {lab:0,kc:0,video:0}; cmp = pa.kc  - pb.kc;  break; }
        case "attendance": cmp = (attendanceByTrainee[a.id] ?? 0) - (attendanceByTrainee[b.id] ?? 0); break;
        case "graduated":  cmp = (a.graduated ? 1 : 0) - (b.graduated ? 1 : 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredTrainees, sortKey, sortDir, filteredProgressByTrainee, attendanceByTrainee]);

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
    // Clear any previous reset result when switching trainees
    setPaneResetPassword(null);
    setPaneResetError("");
    setPaneResetCopied(false);
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

  // ── Temp password helpers ──────────────────────────────────────────────────

  // All trainees are eligible — we create accounts for those without one
  const eligibleForPass = filteredTrainees;

  // Trainee whose side pane is open
  const detailTrainee = useMemo(
    () => liveTrainees.find((t) => t.id === detailTraineeId) ?? null,
    [liveTrainees, detailTraineeId]
  );

  function toggleSelectTrainee(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size >= eligibleForPass.length && eligibleForPass.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleForPass.map((t) => t.id)));
    }
  }

  function toggleShowPass(id: string) {
    setShowPassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleGeneratePasses() {
    const targets = filteredTrainees.filter((t) => selectedIds.has(t.id));
    if (!targets.length) return;
    setIsGenerating(true);
    const results: { id: string; name: string; password?: string; error?: string }[] = [];
    for (const t of targets) {
      const res = await setTraineeTempPassword(t.id, cohortId);
      results.push({ id: t.id, name: t.full_name, password: res.tempPassword, error: res.error });
    }
    setPassResults(results);
    setIsGenerating(false);
    setShowPassResults(true);
    setTempPassMode(false);
    setSelectedIds(new Set());
  }

  function copyWithFeedback(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    });
  }

  function handleVisitAccount(trainee: Trainee) {
    window.open(`/trainer/cohorts/${cohortId}/trainees/${trainee.id}`, "_blank");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortArrow({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-0.5 text-slate-300">⇅</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleDelete(traineeId: string) {
    startTransition(async () => {
      const res = await softDeleteTrainee(traineeId, cohortId);
      if (res.error) { toast(res.error, "error"); } else { toast("Trainee removed"); }
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  function handleRestore(traineeId: string) {
    setRestoringId(traineeId);
    startTransition(async () => {
      const res = await restoreTrainee(traineeId, cohortId);
      if (res.error) { toast(res.error, "error"); } else { toast("Trainee restored"); }
      setRestoringId(null);
      router.refresh();
    });
  }

  function handleExportCsv() {
    const headers = ["#", "Name", "Personal Email", "Status", "Labs Done", "Labs Total", "KCs Done", "KCs Total", "Sessions Attended", "Total Sessions", "Graduated"];
    const dataRows = sortedTrainees.map((t) => {
      const p = filteredProgressByTrainee[t.id] ?? { kc: 0, lab: 0, video: 0 };
      return [
        String(t.serial_no ?? ""), t.full_name, t.personal_email, t.status,
        String(p.lab), String(filteredTotals.lab),
        String(p.kc),  String(filteredTotals.kc),
        String(attendanceByTrainee[t.id] ?? 0), String(totalSessions),
        t.graduated ? "Yes" : "No",
      ];
    });
    downloadCsv([headers, ...dataRows], `${cohortCodeName}_trainees.csv`);
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                title="Export trainee list as CSV"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
              <button
                onClick={() => { setTempPassMode((v) => !v); setSelectedIds(new Set()); }}
                className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                  tempPassMode ? "bg-orange-500 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                title="Generate temporary passwords for trainees"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Temp Passwords
              </button>
              {liveTrainees.some((t) => t.temp_password && !t.temp_password_changed_at) && (
                <button
                  onClick={() => {
                    const rows: string[][] = [
                      ["Name", "Email", "Temp Password", "Login URL", "Cohort"],
                      ...liveTrainees
                        .filter((t) => t.temp_password && !t.temp_password_changed_at)
                        .map((t) => [t.full_name, t.personal_email, t.temp_password!, loginUrl, cohortCodeName]),
                    ];
                    downloadCsv(rows, `${cohortCodeName}_login_details.csv`);
                  }}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  title="Export login details CSV for mail merge"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Logins
                </button>
              )}
              <RefreshButton cohortId={cohortId} />
            </div>
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

        {/* Bulk action bar */}
        {tempPassMode && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-orange-50 border-t border-orange-100">
            <span className="text-xs text-orange-700 font-medium">
              {selectedIds.size === 0
                ? `Select trainees (${eligibleForPass.length} — accounts will be created if needed)`
                : `${selectedIds.size} selected`}
            </span>
            {selectedIds.size > 0 && (
              <button
                onClick={handleGeneratePasses}
                disabled={isGenerating}
                className="text-xs font-medium bg-orange-500 text-white px-3 py-1 rounded-lg hover:bg-orange-600 disabled:bg-orange-300 transition-colors"
              >
                {isGenerating ? "Generating…" : `Generate for ${selectedIds.size}`}
              </button>
            )}
            <button
              onClick={() => { setTempPassMode(false); setSelectedIds(new Set()); }}
              className="text-xs text-slate-500 hover:text-slate-700 ml-auto"
            >
              Cancel
            </button>
          </div>
        )}

        {!filteredTrainees.length ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {liveTrainees.length === 0
              ? "No trainees yet — upload a roster above or sync from Canvas."
              : "No trainees match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200">
                  {tempPassMode && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={eligibleForPass.length > 0 && selectedIds.size >= eligibleForPass.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 accent-orange-500"
                        title="Select all"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-12 cursor-pointer hover:text-slate-700" onClick={() => toggleSort("serial")}># <SortArrow col="serial" /></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700" onClick={() => toggleSort("name")}>Name <SortArrow col="name" /></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700" onClick={() => toggleSort("email")}>Personal email <SortArrow col="email" /></th>
                  {!isPractitioner && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Amalitech email</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700" onClick={() => toggleSort("status")}>Status <SortArrow col="status" /></th>
                  {hasTasks && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 min-w-[160px]">
                      <span className="mr-1">{selectedWeeks.length > 0 ? `Progress (wk ${[...selectedWeeks].sort((a,b)=>a-b).join("+")})` : "Progress"}</span>
                      <button onClick={() => toggleSort("lab")} className={`text-[10px] px-1.5 py-0.5 rounded font-medium mr-0.5 ${sortKey==="lab" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        Lab{sortKey==="lab" ? (sortDir==="asc" ? "↑" : "↓") : ""}
                      </button>
                      <button onClick={() => toggleSort("kc")} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sortKey==="kc" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        KC{sortKey==="kc" ? (sortDir==="asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                  )}
                  {totalSessions > 0 && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700" onClick={() => toggleSort("attendance")}>Attendance <SortArrow col="attendance" /></th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700" onClick={() => toggleSort("graduated")}>Graduated <SortArrow col="graduated" /></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Temp Pass</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedTrainees.map((t) => {
                  const progress = filteredProgressByTrainee[t.id] ?? { kc: 0, lab: 0, video: 0 };
                  const online   = !!t.user_id && onlineSet.has(t.user_id);
                  const lastSeen = t.user_id ? (lastSeenByUserId[t.user_id] ?? null) : null;
                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-orange-50 cursor-pointer transition-colors ${tempPassMode && selectedIds.has(t.id) ? "bg-orange-50" : ""}`}
                      onClick={() => tempPassMode ? toggleSelectTrainee(t.id) : setDetailTraineeId(t.id)}
                      title={tempPassMode ? "Click to select" : "Click to view trainee details"}
                    >
                      {tempPassMode && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(t.id)}
                            onChange={() => toggleSelectTrainee(t.id)}
                            className="rounded border-slate-300 accent-orange-500"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-400 text-xs">{t.serial_no ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 hover:text-orange-600 transition-colors">
                        {isPractitioner ? toTitleCase(t.full_name) : t.full_name}
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

                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {t.temp_password_changed_at ? (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            Changed
                          </span>
                        ) : t.temp_password ? (
                          <div className="flex items-center gap-1">
                            <code className="text-xs font-mono text-slate-600 select-all">
                              {showPassIds.has(t.id) ? t.temp_password : "•••••••••"}
                            </code>
                            <button
                              onClick={() => toggleShowPass(t.id)}
                              className="text-slate-300 hover:text-slate-600 transition-colors ml-0.5"
                              title={showPassIds.has(t.id) ? "Hide password" : "Show password"}
                            >
                              {showPassIds.has(t.id) ? (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-200 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        {confirmDeleteId === t.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">Delete?</span>
                            <button onClick={() => handleDelete(t.id)} disabled={isPending} className="text-[10px] font-medium text-red-600 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-50">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-50">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="text-slate-200 hover:text-red-400 transition-colors"
                            title="Remove trainee"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deleted trainees */}
      {deletedTrainees.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-4">
          <div className="px-6 py-3 border-b border-slate-200 bg-red-50">
            <h2 className="text-sm font-semibold text-red-700">
              Deleted trainees <span className="font-normal text-red-400">({deletedTrainees.length})</span>
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
                  <tr key={t.id} className="opacity-70">
                    <td className="px-4 py-3 font-medium text-slate-700">{isPractitioner ? toTitleCase(t.full_name) : t.full_name}</td>
                    <td className="px-4 py-3 text-slate-500">{t.personal_email}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(t.deleted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRestore(t.id)}
                        disabled={isPending || restoringId === t.id}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {restoringId === t.id ? "Restoring…" : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Temp password results modal */}
      {showPassResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Temp Passwords Generated</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {passResults.filter((r) => r.password).length} of {passResults.length} succeeded
                </p>
              </div>
              <button
                onClick={() => { setPassResults([]); setShowPassResults(false); }}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="px-6 py-3 text-xs text-slate-500 border-b border-slate-100 shrink-0">
              Share each password with the trainee. Passwords are also visible in the table row until the trainee changes them.
            </p>
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
              {passResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
                    {r.error ? (
                      <p className="text-xs text-red-600 mt-0.5">{r.error}</p>
                    ) : (
                      <code className="text-xs font-mono bg-slate-100 border border-slate-200 px-2 py-0.5 rounded mt-0.5 inline-block select-all">
                        {r.password}
                      </code>
                    )}
                  </div>
                  {!r.error && r.password && (
                    <button
                      onClick={() => copyWithFeedback(r.password!, r.id)}
                      className="shrink-0 transition-colors"
                      title="Copy password"
                    >
                      {copiedId === r.id ? (
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          Copied!
                        </span>
                      ) : (
                        <svg className="w-4 h-4 text-slate-300 hover:text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  const text = passResults.filter((r) => r.password).map((r) => `${r.name}: ${r.password}`).join("\n");
                  copyWithFeedback(text, "__all__");
                }}
                className="text-xs font-medium transition-colors"
              >
                {copiedId === "__all__" ? (
                  <span className="text-green-600 font-semibold">All copied!</span>
                ) : (
                  <span className="text-slate-600 hover:text-orange-600">Copy all to clipboard</span>
                )}
              </button>
              <button
                onClick={() => {
                  const emailById = new Map(liveTrainees.map((t) => [t.id, t.personal_email]));
                  const rows: string[][] = [
                    ["Name", "Email", "Temp Password", "Login URL", "Cohort"],
                    ...passResults
                      .filter((r) => r.password)
                      .map((r) => [r.name, emailById.get(r.id) ?? "", r.password!, loginUrl, cohortCodeName]),
                  ];
                  downloadCsv(rows, `${cohortCodeName}_temp_passwords.csv`);
                }}
                className="flex items-center gap-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900">
                  {detailData?.trainee.full_name
                    ? (isPractitioner ? toTitleCase(detailData.trainee.full_name) : detailData.trainee.full_name)
                    : "Loading…"}
                </h2>
                {detailData && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {detailData.trainee.amalitech_email ?? detailData.trainee.personal_email}
                    <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full capitalize ${STATUS_BADGE[detailData.trainee.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {detailData.trainee.status}
                    </span>
                  </p>
                )}
                {detailTrainee?.user_id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleVisitAccount(detailTrainee)}
                      className="text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-200 hover:bg-orange-50 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Visit account
                    </button>
                    <button
                      disabled={paneResetLoading}
                      onClick={async () => {
                        if (!detailTrainee) return;
                        setPaneResetLoading(true);
                        setPaneResetPassword(null);
                        setPaneResetError("");
                        setPaneResetCopied(false);
                        const res = await setTraineeTempPassword(detailTrainee.id, cohortId);
                        setPaneResetLoading(false);
                        if (res.error) { setPaneResetError(res.error); return; }
                        if (res.tempPassword) setPaneResetPassword(res.tempPassword);
                      }}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      {paneResetLoading ? "Resetting…" : "Reset password"}
                    </button>
                  </div>
                )}
                {/* Reset password result */}
                {paneResetError && (
                  <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{paneResetError}</p>
                )}
                {paneResetPassword && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1.5">
                    <p className="text-xs font-semibold text-amber-800">Temporary password generated</p>
                    <p className="text-xs text-amber-700">Share this with the trainee. They should change it after logging in.</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-sm font-mono font-bold text-amber-900 bg-amber-100 px-2.5 py-1.5 rounded-lg tracking-wider select-all">
                        {paneResetPassword}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(paneResetPassword);
                          setPaneResetCopied(true);
                          setTimeout(() => setPaneResetCopied(false), 2000);
                        }}
                        className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-300 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        {paneResetCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
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
