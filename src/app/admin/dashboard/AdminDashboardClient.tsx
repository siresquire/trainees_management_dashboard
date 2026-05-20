"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { uploadAdminVoucherPool, issueVouchersToTrainees, type ExamType } from "@/actions/admin-vouchers";
import type { SessionInfo, TaskInfo, QuizInfo } from "./page";

export type AdminTraineeRow = {
  traineeId:          string;
  serialNo:           number | null;
  fullName:           string;
  personalEmail:      string;
  amalitechEmail:     string | null;
  status:             string;
  examApproved:       boolean;
  labsDone:           number;
  labsTotal:          number;
  kcsDone:            number;
  kcsTotal:           number;
  sessionsAttended:   number;
  sessionsTotal:      number;
  cohortId:           string;
  cohortCode:         string;
  cohortLevel:        string;
  trainerName:        string;
  issuedVoucher:      string | null;
  // For week filter
  attendedSessionIds: string[];
  completedLabIds:    string[];
  completedKcIds:     string[];
  // For quiz panel
  quizScores:         Array<{ quizId: string; score: number }>;
};

type Props = {
  rows:                  AdminTraineeRow[];
  poolCountPractitioner: number;
  poolCountAssociate:    number;
  allSessions:           SessionInfo[];
  allTasks:              TaskInfo[];
  allQuizzes:            QuizInfo[];
};

export default function AdminDashboardClient({
  rows,
  poolCountPractitioner,
  poolCountAssociate,
  allSessions,
  allTasks,
  allQuizzes,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [level,           setLevel]           = useState<"practitioner" | "associate">("practitioner");
  const [searchQuery,     setSearchQuery]     = useState("");
  const [trainerFilter,   setTrainerFilter]   = useState("");
  const [cohortFilter,    setCohortFilter]    = useState("");
  const [weekFilter,      setWeekFilter]      = useState<Set<number>>(new Set());
  const [showWeekPicker,  setShowWeekPicker]  = useState(false);
  const [quizPanelRow,    setQuizPanelRow]    = useState<AdminTraineeRow | null>(null);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [showUpload,      setShowUpload]      = useState(false);
  const [voucherText,     setVoucherText]     = useState("");
  const [uploadLevel,     setUploadLevel]     = useState<"practitioner" | "associate">("practitioner");
  const [issueExamType,   setIssueExamType]   = useState<ExamType>("CCP");
  const [confirmIssue,    setConfirmIssue]    = useState(false);

  const weekPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showWeekPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (weekPickerRef.current && !weekPickerRef.current.contains(e.target as Node)) {
        setShowWeekPicker(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showWeekPicker]);

  // ── Derived lists ────────────────────────────────────────────────────────
  const levelRows = useMemo(
    () => rows.filter((r) => r.cohortLevel === level),
    [rows, level]
  );

  const levelCohortIds = useMemo(
    () => new Set(levelRows.map((r) => r.cohortId)),
    [levelRows]
  );

  const uniqueTrainers = useMemo(
    () => [...new Set(levelRows.map((r) => r.trainerName))].sort(),
    [levelRows]
  );

  const uniqueCohorts = useMemo(() => {
    const src = trainerFilter ? levelRows.filter((r) => r.trainerName === trainerFilter) : levelRows;
    return [...new Set(src.map((r) => r.cohortCode))].sort();
  }, [levelRows, trainerFilter]);

  const availableWeeks = useMemo(() => {
    const weeks = new Set<number>();
    for (const s of allSessions) if (levelCohortIds.has(s.cohortId)) weeks.add(s.weekNumber);
    for (const t of allTasks)    if (levelCohortIds.has(t.cohortId)) weeks.add(t.weekNumber);
    return [...weeks].sort((a, b) => a - b);
  }, [allSessions, allTasks, levelCohortIds]);

  const filtered = useMemo(() => {
    let result = levelRows;
    if (trainerFilter) result = result.filter((r) => r.trainerName === trainerFilter);
    if (cohortFilter)  result = result.filter((r) => r.cohortCode  === cohortFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) => r.fullName.toLowerCase().includes(q) || r.personalEmail.toLowerCase().includes(q)
      );
    }
    return result;
  }, [levelRows, trainerFilter, cohortFilter, searchQuery]);

  // ── Week-filtered cohort stats ───────────────────────────────────────────
  const cohortWeekStats = useMemo(() => {
    if (weekFilter.size === 0) return null;
    const map = new Map<string, { labIds: Set<string>; kcIds: Set<string>; sessionIds: Set<string> }>();
    for (const s of allSessions) {
      if (!weekFilter.has(s.weekNumber) || !levelCohortIds.has(s.cohortId)) continue;
      const stat = map.get(s.cohortId) ?? { labIds: new Set(), kcIds: new Set(), sessionIds: new Set() };
      stat.sessionIds.add(s.id);
      map.set(s.cohortId, stat);
    }
    for (const t of allTasks) {
      if (!weekFilter.has(t.weekNumber) || !levelCohortIds.has(t.cohortId)) continue;
      const stat = map.get(t.cohortId) ?? { labIds: new Set(), kcIds: new Set(), sessionIds: new Set() };
      if (t.taskType === "lab") stat.labIds.add(t.id);
      else if (t.taskType === "kc") stat.kcIds.add(t.id);
      map.set(t.cohortId, stat);
    }
    return map;
  }, [allSessions, allTasks, weekFilter, levelCohortIds]);

  function getStats(r: AdminTraineeRow) {
    if (!cohortWeekStats) {
      return { labsDone: r.labsDone, labsTotal: r.labsTotal, kcsDone: r.kcsDone, kcsTotal: r.kcsTotal, sessionsAttended: r.sessionsAttended, sessionsTotal: r.sessionsTotal };
    }
    const stat = cohortWeekStats.get(r.cohortId);
    if (!stat) return { labsDone: 0, labsTotal: 0, kcsDone: 0, kcsTotal: 0, sessionsAttended: 0, sessionsTotal: 0 };
    return {
      labsDone:         r.completedLabIds.filter((id) => stat.labIds.has(id)).length,
      labsTotal:        stat.labIds.size,
      kcsDone:          r.completedKcIds.filter((id) => stat.kcIds.has(id)).length,
      kcsTotal:         stat.kcIds.size,
      sessionsAttended: r.attendedSessionIds.filter((id) => stat.sessionIds.has(id)).length,
      sessionsTotal:    stat.sessionIds.size,
    };
  }

  const poolCount = level === "associate" ? poolCountAssociate : poolCountPractitioner;

  // ── Actions ──────────────────────────────────────────────────────────────
  function switchLevel(l: "practitioner" | "associate") {
    setLevel(l);
    setSelectedIds(new Set());
    setIssueExamType(l === "associate" ? "SAA-C03" : "CCP");
    setUploadLevel(l);
    setTrainerFilter("");
    setCohortFilter("");
    setWeekFilter(new Set());
  }

  function handleTrainerFilter(name: string) {
    setTrainerFilter(name);
    setCohortFilter("");
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllApproved() {
    setSelectedIds(new Set(filtered.filter((r) => r.examApproved && !r.issuedVoucher).map((r) => r.traineeId)));
  }

  function clearSelection() { setSelectedIds(new Set()); }

  function handleUpload() {
    const codes = voucherText.split(/[\n,]+/).map((c) => c.trim()).filter(Boolean);
    if (!codes.length) { toast("No voucher codes found", "error"); return; }
    startTransition(async () => {
      const res = await uploadAdminVoucherPool(codes, uploadLevel);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Uploaded ${res.inserted} codes (${res.duplicates} duplicates skipped)`);
      setVoucherText("");
      setShowUpload(false);
      router.refresh();
    });
  }

  function handleIssueVouchers() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setConfirmIssue(false);
    startTransition(async () => {
      const res = await issueVouchersToTrainees(
        ids,
        filtered.find((r) => selectedIds.has(r.traineeId))?.cohortId ?? "",
        issueExamType,
        level,
      );
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Issued ${res.issued} voucher${res.issued !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  const selectedCount = selectedIds.size;
  const weekLabel = weekFilter.size === 0 ? "All weeks" : `Wk ${[...weekFilter].sort((a, b) => a - b).join(", ")}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Voucher issuance and trainee readiness across all cohorts</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-900">{poolCountPractitioner}</span> Practitioner codes
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600">
              <span className="font-semibold text-slate-900">{poolCountAssociate}</span> Associate codes
            </span>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Vouchers
            </button>
          </div>
        </div>

        {/* ── Upload panel ── */}
        {showUpload && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-xl">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Upload Voucher Codes</h3>
            <textarea
              value={voucherText}
              onChange={(e) => setVoucherText(e.target.value)}
              placeholder="Paste voucher codes here, one per line or comma-separated"
              rows={5}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Level:</label>
                <select
                  value={uploadLevel}
                  onChange={(e) => setUploadLevel(e.target.value as "practitioner" | "associate")}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="practitioner">Practitioner</option>
                  <option value="associate">Associate</option>
                </select>
              </div>
              <button
                onClick={handleUpload}
                disabled={isPending || !voucherText.trim()}
                className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isPending ? "Uploading…" : "Upload"}
              </button>
              <button
                onClick={() => { setShowUpload(false); setVoucherText(""); }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Main card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

          {/* ── Top bar: level tabs + filters + actions ── */}
          <div className="px-6 py-4 border-b border-slate-200 space-y-3">
            {/* Row 1: level tabs + filter selects + week picker */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Level tabs */}
              <div className="flex gap-1">
                {(["practitioner", "associate"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => switchLevel(l)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                      level === l ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-slate-200" />

              {/* Trainer filter */}
              <select
                value={trainerFilter}
                onChange={(e) => handleTrainerFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="">All trainers</option>
                {uniqueTrainers.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              {/* Cohort filter */}
              <select
                value={cohortFilter}
                onChange={(e) => setCohortFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="">All cohorts</option>
                {uniqueCohorts.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Week filter */}
              {availableWeeks.length > 0 && (
                <div ref={weekPickerRef} className="relative">
                  <button
                    onClick={() => setShowWeekPicker((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors ${
                      weekFilter.size > 0
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {weekLabel}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showWeekPicker && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[130px] max-h-60 overflow-y-auto">
                      <div className="p-1.5 space-y-0.5">
                        {availableWeeks.map((w) => (
                          <label key={w} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 accent-purple-600"
                              checked={weekFilter.has(w)}
                              onChange={() => setWeekFilter((prev) => {
                                const next = new Set(prev);
                                if (next.has(w)) next.delete(w); else next.add(w);
                                return next;
                              })}
                            />
                            <span className="text-xs text-slate-700">Week {w}</span>
                          </label>
                        ))}
                      </div>
                      {weekFilter.size > 0 && (
                        <button
                          onClick={() => setWeekFilter(new Set())}
                          className="w-full text-xs text-purple-600 hover:bg-purple-50 font-medium px-3 py-2 text-left border-t border-slate-100"
                        >
                          Clear weeks
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Clear all filters */}
              {(trainerFilter || cohortFilter || weekFilter.size > 0) && (
                <button
                  onClick={() => { setTrainerFilter(""); setCohortFilter(""); setWeekFilter(new Set()); }}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Row 2: search + selection actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="search"
                placeholder="Search by name or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400"
              />

              {selectedCount > 0 ? (
                <>
                  <span className="text-xs text-slate-500">{selectedCount} selected</span>
                  <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-700 underline">Clear</button>
                  <div className="flex items-center gap-2">
                    <select
                      value={issueExamType}
                      onChange={(e) => setIssueExamType(e.target.value as ExamType)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none"
                    >
                      {level === "practitioner"
                        ? <option value="CCP">CCP</option>
                        : <>
                            <option value="SAA-C03">SAA-C03</option>
                            <option value="DVA-C02">DVA-C02</option>
                          </>
                      }
                    </select>
                    <button
                      onClick={() => setConfirmIssue(true)}
                      disabled={isPending || poolCount === 0}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      Issue Vouchers ({selectedCount})
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={selectAllApproved}
                  className="text-xs font-medium text-purple-600 hover:text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  Select all approved
                </button>
              )}

              <span className="ml-auto text-xs text-slate-400">
                {filtered.length} trainee{filtered.length !== 1 ? "s" : ""}
                {weekFilter.size > 0 && <span className="ml-1 text-purple-500 font-medium">· {weekLabel}</span>}
              </span>
            </div>
          </div>

          {/* ── Confirm issue dialog ── */}
          {confirmIssue && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-4">
              <span className="text-sm text-amber-800">
                Issue <strong>{selectedCount}</strong> voucher{selectedCount !== 1 ? "s" : ""} ({issueExamType}) from pool ({poolCount} available)?
              </span>
              <button onClick={handleIssueVouchers} disabled={isPending} className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
                Confirm
              </button>
              <button onClick={() => setConfirmIssue(false)} className="text-xs text-amber-700 hover:text-amber-900">
                Cancel
              </button>
            </div>
          )}

          {/* ── Table ── */}
          {!filtered.length ? (
            <div className="py-12 text-center text-sm text-slate-400">No trainees found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={selectedCount === filtered.length && filtered.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map((r) => r.traineeId)));
                          else clearSelection();
                        }}
                      />
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Trainer</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Cohort</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 w-8">#</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Name</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Email</th>
                    {level === "associate" && (
                      <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Amalitech Email</th>
                    )}
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Labs</th>
                    {level === "practitioner" && (
                      <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">KCs</th>
                    )}
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Attendance</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Quiz Scores</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Exam Approved</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Voucher</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const { labsDone, labsTotal, kcsDone, kcsTotal, sessionsAttended, sessionsTotal } = getStats(r);
                    return (
                      <tr
                        key={r.traineeId}
                        className={`hover:bg-slate-50 transition-colors ${selectedIds.has(r.traineeId) ? "bg-purple-50" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded border-slate-300" checked={selectedIds.has(r.traineeId)} onChange={() => toggleSelect(r.traineeId)} />
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{r.trainerName}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{r.cohortCode}</td>
                        <td className="px-3 py-3 text-xs text-slate-400 tabular-nums">{r.serialNo ?? "—"}</td>
                        <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">{r.fullName}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{r.personalEmail}</td>
                        {level === "associate" && (
                          <td className="px-3 py-3 text-xs text-slate-500">{r.amalitechEmail ?? "—"}</td>
                        )}
                        <td className="px-3 py-3 text-xs tabular-nums">
                          {labsTotal > 0
                            ? <span className={labsDone >= labsTotal ? "text-green-600 font-medium" : "text-slate-600"}>{labsDone}/{labsTotal}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {level === "practitioner" && (
                          <td className="px-3 py-3 text-xs tabular-nums">
                            {kcsTotal > 0
                              ? <span className={kcsDone >= kcsTotal ? "text-green-600 font-medium" : "text-slate-600"}>{kcsDone}/{kcsTotal}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-3 text-xs tabular-nums">
                          {sessionsTotal > 0
                            ? <span className={
                                sessionsAttended / sessionsTotal >= 0.75 ? "text-green-600 font-medium"
                                : sessionsAttended / sessionsTotal >= 0.5  ? "text-amber-600"
                                : "text-red-600"
                              }>{sessionsAttended}/{sessionsTotal}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setQuizPanelRow(r)}
                            className="text-xs text-purple-600 hover:text-purple-700 underline underline-offset-2"
                          >
                            View
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {r.examApproved
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">✓ Approved</span>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {r.issuedVoucher
                            ? <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">{r.issuedVoucher}</code>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Quiz Scores Panel ── */}
      {quizPanelRow && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={() => setQuizPanelRow(null)} />
          <div className="w-96 bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
              <div className="min-w-0 pr-4">
                <h2 className="text-sm font-semibold text-slate-900 truncate">{quizPanelRow.fullName}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{quizPanelRow.cohortCode} · {quizPanelRow.trainerName}</p>
                <p className="text-xs text-slate-400">{quizPanelRow.personalEmail}</p>
              </div>
              <button onClick={() => setQuizPanelRow(null)} className="shrink-0 text-slate-400 hover:text-slate-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Mock Exam Quiz Scores</p>
              {(() => {
                const cohortQuizzes = allQuizzes.filter((q) => q.cohortId === quizPanelRow.cohortId);
                const scoreMap = new Map(quizPanelRow.quizScores.map((qs) => [qs.quizId, qs.score]));

                if (cohortQuizzes.length === 0) {
                  return <p className="text-sm text-slate-400">No quizzes configured for this cohort.</p>;
                }

                const taken    = cohortQuizzes.filter((q) => scoreMap.has(q.id));
                const notTaken = cohortQuizzes.filter((q) => !scoreMap.has(q.id));

                return (
                  <div className="space-y-1">
                    {cohortQuizzes.map((quiz) => {
                      const score = scoreMap.get(quiz.id);
                      const pct   = score !== undefined ? Math.round((score / quiz.maxScore) * 100) : null;
                      return (
                        <div key={quiz.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-medium text-slate-800 truncate">{quiz.quizName}</p>
                            <p className="text-xs text-slate-400">Week {quiz.weekNumber}</p>
                          </div>
                          {score !== undefined ? (
                            <div className="shrink-0 text-right">
                              <span className={`text-xs font-semibold tabular-nums ${pct! >= 70 ? "text-green-600" : pct! >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                {score}/{quiz.maxScore}
                              </span>
                              <span className="text-xs text-slate-400 ml-1">({pct}%)</span>
                            </div>
                          ) : (
                            <span className="shrink-0 text-xs text-slate-300 italic">not taken</span>
                          )}
                        </div>
                      );
                    })}

                    {taken.length > 0 && (
                      <div className="pt-3 border-t border-slate-200 mt-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Average ({taken.length} quiz{taken.length !== 1 ? "zes" : ""})</span>
                          <span className="font-semibold text-slate-700 tabular-nums">
                            {Math.round(taken.reduce((sum, q) => sum + (scoreMap.get(q.id)! / q.maxScore) * 100, 0) / taken.length)}%
                          </span>
                        </div>
                        {notTaken.length > 0 && (
                          <p className="text-xs text-slate-400 mt-1">{notTaken.length} quiz{notTaken.length !== 1 ? "zes" : ""} not yet taken</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
