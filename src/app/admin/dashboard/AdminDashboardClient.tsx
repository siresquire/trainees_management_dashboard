"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { uploadAdminVoucherPool, issueVouchersToTrainees, type ExamType } from "@/actions/admin-vouchers";
import { revokeVoucher, setVoucherDeadline, saveAdminThresholds } from "@/actions/admin-settings";
import type { SessionInfo, TaskInfo, QuizInfo, VoucherRow, RevokedVoucherRow, ThresholdSettings } from "./page";

export type AdminTraineeRow = {
  traineeId:        string;
  serialNo:         number | null;
  fullName:         string;
  personalEmail:    string;
  amalitechEmail:   string | null;
  status:           string;
  examApproved:     boolean;
  labsDone:         number;
  labsTotal:        number;
  kcsDone:          number;
  kcsTotal:         number;
  sessionsAttended: number;
  sessionsTotal:    number;
  cohortId:         string;
  cohortCode:       string;
  cohortLevel:      string;
  trainerName:      string;
  issuedVoucher:    string | null;
  issuedVoucherId:  string | null;
  voucherDeadline:  string | null;
  examAppointment:  { examDate: string; examTime: string; examLocation: string } | null;
  weeklyStats:      Array<{ weekNumber: number | null; labsDone: number; kcsDone: number; sessionsAttended: number }>;
  quizScores:       Array<{ quizId: string; score: number }>;
};

type Props = {
  rows:                  AdminTraineeRow[];
  poolCountPractitioner: number;
  poolCountAssociate:    number;
  allSessions:           SessionInfo[];
  allTasks:              TaskInfo[];
  allQuizzes:            QuizInfo[];
  allVouchers:           VoucherRow[];
  revokedVouchers:       RevokedVoucherRow[];
  thresholds:            Record<string, ThresholdSettings>;
};

function pct(done: number, total: number) {
  if (total === 0) return null;
  return (done / total) * 100;
}

type EligibilityStatus = "eligible" | "ineligible" | "unknown";

function eligibility(value: number | null, threshold: number): EligibilityStatus {
  if (value === null || threshold === 0) return "unknown";
  return value >= threshold ? "eligible" : "ineligible";
}

function EligBadge({ status }: { status: EligibilityStatus }) {
  if (status === "eligible")   return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">✓ Eligible</span>;
  if (status === "ineligible") return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 whitespace-nowrap">✗ Not eligible</span>;
  return <span className="text-xs text-slate-300">—</span>;
}

function VoucherStat({ icon, count, color, tip }: { icon: "pool" | "issued" | "revoked"; count: number; color: "slate" | "green" | "red"; tip: string }) {
  const textColor = color === "green" ? "text-green-600" : color === "red" ? "text-red-500" : "text-slate-500";
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${textColor}`} title={tip}>
      {icon === "pool"    && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>}
      {icon === "issued"  && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      {icon === "revoked" && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      {count}
    </span>
  );
}

export default function AdminDashboardClient({
  rows,
  poolCountPractitioner,
  poolCountAssociate,
  allSessions,
  allTasks,
  allQuizzes,
  allVouchers,
  revokedVouchers,
  thresholds,
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
  const [showThresholds,  setShowThresholds]  = useState(false);
  const [dbPct,           setDbPct]           = useState(thresholds[level]?.dataBundlePct ?? 0);
  const [stipendPct,      setStipendPct]      = useState(thresholds[level]?.stipendPct ?? 0);
  const [deadlineRow,     setDeadlineRow]     = useState<AdminTraineeRow | null>(null);
  const [deadlineVal,     setDeadlineVal]     = useState("");
  const [showRevoked,     setShowRevoked]     = useState(false);
  const [revealedCodes,   setRevealedCodes]   = useState<Set<string>>(new Set());

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

  // Sync threshold inputs when level switches
  useEffect(() => {
    setDbPct(thresholds[level]?.dataBundlePct ?? 0);
    setStipendPct(thresholds[level]?.stipendPct ?? 0);
  }, [level, thresholds]);

  // ── Derived lists ────────────────────────────────────────────────────────
  const levelRows = useMemo(() => rows.filter((r) => r.cohortLevel === level), [rows, level]);
  const levelCohortIds = useMemo(() => new Set(levelRows.map((r) => r.cohortId)), [levelRows]);

  const uniqueTrainers = useMemo(
    () => [...new Set(levelRows.map((r) => r.trainerName))].sort(), [levelRows]
  );
  const uniqueCohorts = useMemo(() => {
    const src = trainerFilter ? levelRows.filter((r) => r.trainerName === trainerFilter) : levelRows;
    return [...new Set(src.map((r) => r.cohortCode))].sort();
  }, [levelRows, trainerFilter]);

  const availableWeeks = useMemo(() => {
    const weeks = new Set<number>();
    for (const s of allSessions) if (levelCohortIds.has(s.cohortId) && s.weekNumber !== null) weeks.add(s.weekNumber);
    for (const t of allTasks)    if (levelCohortIds.has(t.cohortId)) weeks.add(t.weekNumber);
    return [...weeks].sort((a, b) => a - b);
  }, [allSessions, allTasks, levelCohortIds]);

  const filtered = useMemo(() => {
    let result = levelRows;
    if (trainerFilter) result = result.filter((r) => r.trainerName === trainerFilter);
    if (cohortFilter)  result = result.filter((r) => r.cohortCode  === cohortFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.fullName.toLowerCase().includes(q) || r.personalEmail.toLowerCase().includes(q));
    }
    return result;
  }, [levelRows, trainerFilter, cohortFilter, searchQuery]);

  // ── Week-filtered cohort totals ──────────────────────────────────────────
  const cohortWeekStats = useMemo(() => {
    if (weekFilter.size === 0) return null;
    const map = new Map<string, { labsTotal: number; kcsTotal: number; sessionsTotal: number }>();
    for (const t of allTasks) {
      if (!weekFilter.has(t.weekNumber) || !levelCohortIds.has(t.cohortId)) continue;
      const stat = map.get(t.cohortId) ?? { labsTotal: 0, kcsTotal: 0, sessionsTotal: 0 };
      if (t.taskType === "lab") stat.labsTotal++;
      else if (t.taskType === "kc") stat.kcsTotal++;
      map.set(t.cohortId, stat);
    }
    for (const s of allSessions) {
      if (s.weekNumber === null || !weekFilter.has(s.weekNumber) || !levelCohortIds.has(s.cohortId)) continue;
      const stat = map.get(s.cohortId) ?? { labsTotal: 0, kcsTotal: 0, sessionsTotal: 0 };
      stat.sessionsTotal++;
      map.set(s.cohortId, stat);
    }
    return map;
  }, [allSessions, allTasks, weekFilter, levelCohortIds]);

  function getStats(r: AdminTraineeRow) {
    if (!cohortWeekStats) {
      return { labsDone: r.labsDone, labsTotal: r.labsTotal, kcsDone: r.kcsDone, kcsTotal: r.kcsTotal, sessionsAttended: r.sessionsAttended, sessionsTotal: r.sessionsTotal };
    }
    const ws = r.weeklyStats.filter((w) => w.weekNumber !== null && weekFilter.has(w.weekNumber));
    const labsDone = ws.reduce((s, w) => s + w.labsDone, 0);
    const kcsDone  = ws.reduce((s, w) => s + w.kcsDone, 0);
    const sessionsAttended = ws.reduce((s, w) => s + w.sessionsAttended, 0);
    const stat = cohortWeekStats.get(r.cohortId);
    return { labsDone, labsTotal: stat?.labsTotal ?? 0, kcsDone, kcsTotal: stat?.kcsTotal ?? 0, sessionsAttended, sessionsTotal: stat?.sessionsTotal ?? 0 };
  }

  const poolCount = level === "associate" ? poolCountAssociate : poolCountPractitioner;

  const issuedPractitioner = useMemo(() => rows.filter((r) => r.cohortLevel === "practitioner" && r.issuedVoucherId).length, [rows]);
  const issuedAssociate    = useMemo(() => rows.filter((r) => r.cohortLevel === "associate"    && r.issuedVoucherId).length, [rows]);
  const traineeLevel = useMemo(() => new Map(rows.map((r) => [r.traineeId, r.cohortLevel])), [rows]);
  const revokedPractitioner = useMemo(() => revokedVouchers.filter((rv) => traineeLevel.get(rv.traineeId) === "practitioner").length, [revokedVouchers, traineeLevel]);
  const revokedAssociate    = useMemo(() => revokedVouchers.filter((rv) => traineeLevel.get(rv.traineeId) === "associate").length,    [revokedVouchers, traineeLevel]);

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function selectAllApproved() {
    setSelectedIds(new Set(filtered.filter((r) => r.examApproved && !r.issuedVoucher).map((r) => r.traineeId)));
  }

  function handleUpload() {
    const codes = voucherText.split(/[\n,]+/).map((c) => c.trim()).filter(Boolean);
    if (!codes.length) { toast("No voucher codes found", "error"); return; }
    startTransition(async () => {
      const res = await uploadAdminVoucherPool(codes, uploadLevel);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Uploaded ${res.inserted} codes (${res.duplicates} duplicates skipped)`);
      setVoucherText(""); setShowUpload(false); router.refresh();
    });
  }

  function handleIssueVouchers() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setConfirmIssue(false);
    startTransition(async () => {
      const res = await issueVouchersToTrainees(
        ids, filtered.find((r) => selectedIds.has(r.traineeId))?.cohortId ?? "", issueExamType, level,
      );
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Issued ${res.issued} voucher${res.issued !== 1 ? "s" : ""}`);
      setSelectedIds(new Set()); router.refresh();
    });
  }

  function handleRevoke(r: AdminTraineeRow) {
    if (!r.issuedVoucherId) return;
    if (!confirm(`Revoke voucher for ${r.fullName}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await revokeVoucher(r.issuedVoucherId!);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Voucher revoked for ${r.fullName}`);
      router.refresh();
    });
  }

  function openDeadlinePicker(r: AdminTraineeRow) {
    setDeadlineRow(r);
    setDeadlineVal(r.voucherDeadline ? r.voucherDeadline.slice(0, 10) : "");
  }

  function handleSetDeadline() {
    if (!deadlineRow?.issuedVoucherId) return;
    startTransition(async () => {
      const res = await setVoucherDeadline(deadlineRow.issuedVoucherId!, deadlineVal || null);
      if (res.error) { toast(res.error, "error"); return; }
      toast(deadlineVal ? `Deadline set for ${deadlineRow.fullName}` : `Deadline cleared`);
      setDeadlineRow(null); router.refresh();
    });
  }

  function handleSaveThresholds() {
    startTransition(async () => {
      const res = await saveAdminThresholds(level, dbPct, stipendPct);
      if (res.error) { toast(res.error, "error"); return; }
      toast("Thresholds saved");
      setShowThresholds(false); router.refresh();
    });
  }

  const selectedCount = selectedIds.size;
  const weekLabel = weekFilter.size === 0 ? "All weeks" : `Wk ${[...weekFilter].sort((a, b) => a - b).join(", ")}`;
  const currentThreshold = thresholds[level] ?? { dataBundlePct: 0, stipendPct: 0 };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Voucher issuance and trainee readiness across all cohorts</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            {/* Practitioner stats */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-1">P</span>
              <VoucherStat icon="pool"    count={poolCountPractitioner} color="slate" tip="Available in pool" />
              <span className="text-slate-200">|</span>
              <VoucherStat icon="issued"  count={issuedPractitioner}    color="green" tip="Issued" />
              <span className="text-slate-200">|</span>
              <VoucherStat icon="revoked" count={revokedPractitioner}   color="red"   tip="Revoked" />
            </div>
            {/* Associate stats */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-1">A</span>
              <VoucherStat icon="pool"    count={poolCountAssociate} color="slate" tip="Available in pool" />
              <span className="text-slate-200">|</span>
              <VoucherStat icon="issued"  count={issuedAssociate}    color="green" tip="Issued" />
              <span className="text-slate-200">|</span>
              <VoucherStat icon="revoked" count={revokedAssociate}   color="red"   tip="Revoked" />
            </div>
            <button
              onClick={() => setShowThresholds((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Thresholds
            </button>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload Vouchers
            </button>
          </div>
        </div>

        {/* ── Thresholds panel ── */}
        {showThresholds && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-xl">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Eligibility Thresholds — <span className="capitalize">{level}</span></h3>
            <p className="text-xs text-slate-500 mb-4">
              Trainees who meet or exceed these percentages (for Labs, KCs, and Attendance) are shown as eligible in the table. Set to 0% to hide eligibility badges.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Data Bundle threshold (%)</label>
                <input
                  type="number" min={0} max={100} value={dbPct}
                  onChange={(e) => setDbPct(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Stipend threshold (%)</label>
                <input
                  type="number" min={0} max={100} value={stipendPct}
                  onChange={(e) => setStipendPct(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveThresholds} disabled={isPending}
                className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowThresholds(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Upload panel ── */}
        {showUpload && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-xl">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Upload Voucher Codes</h3>
            <textarea
              value={voucherText} onChange={(e) => setVoucherText(e.target.value)}
              placeholder="Paste voucher codes here, one per line or comma-separated"
              rows={5}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Level:</label>
                <select value={uploadLevel} onChange={(e) => setUploadLevel(e.target.value as "practitioner" | "associate")}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="practitioner">Practitioner</option>
                  <option value="associate">Associate</option>
                </select>
              </div>
              <button onClick={handleUpload} disabled={isPending || !voucherText.trim()}
                className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                {isPending ? "Uploading…" : "Upload"}
              </button>
              <button onClick={() => { setShowUpload(false); setVoucherText(""); }} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Main card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

          {/* ── Top bar ── */}
          <div className="px-6 py-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {(["practitioner", "associate"] as const).map((l) => (
                  <button key={l} onClick={() => switchLevel(l)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${level === l ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-slate-200" />
              <select value={trainerFilter} onChange={(e) => { setTrainerFilter(e.target.value); setCohortFilter(""); }}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="">All trainers</option>
                {uniqueTrainers.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="">All cohorts</option>
                {uniqueCohorts.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {availableWeeks.length > 0 && (
                <div ref={weekPickerRef} className="relative">
                  <button onClick={() => setShowWeekPicker((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors ${weekFilter.size > 0 ? "border-purple-300 bg-purple-50 text-purple-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {weekLabel}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showWeekPicker && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[130px] max-h-60 overflow-y-auto">
                      <div className="p-1.5 space-y-0.5">
                        {availableWeeks.map((w) => (
                          <label key={w} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                            <input type="checkbox" className="rounded border-slate-300 accent-purple-600"
                              checked={weekFilter.has(w)}
                              onChange={() => setWeekFilter((prev) => { const n = new Set(prev); if (n.has(w)) n.delete(w); else n.add(w); return n; })} />
                            <span className="text-xs text-slate-700">Week {w}</span>
                          </label>
                        ))}
                      </div>
                      {weekFilter.size > 0 && (
                        <button onClick={() => setWeekFilter(new Set())}
                          className="w-full text-xs text-purple-600 hover:bg-purple-50 font-medium px-3 py-2 text-left border-t border-slate-100">
                          Clear weeks
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {(trainerFilter || cohortFilter || weekFilter.size > 0) && (
                <button onClick={() => { setTrainerFilter(""); setCohortFilter(""); setWeekFilter(new Set()); }}
                  className="text-xs text-slate-400 hover:text-slate-600 underline">
                  Clear filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <input type="search" placeholder="Search by name or email…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400" />
              {selectedCount > 0 ? (
                <>
                  <span className="text-xs text-slate-500">{selectedCount} selected</span>
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 underline">Clear</button>
                  <div className="flex items-center gap-2">
                    <select value={issueExamType} onChange={(e) => setIssueExamType(e.target.value as ExamType)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
                      {level === "practitioner"
                        ? <option value="CCP">CCP</option>
                        : <><option value="SAA-C03">SAA-C03</option><option value="DVA-C02">DVA-C02</option></>}
                    </select>
                    <button onClick={() => setConfirmIssue(true)} disabled={isPending || poolCount === 0}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg whitespace-nowrap">
                      Issue Vouchers ({selectedCount})
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={selectAllApproved}
                  className="text-xs font-medium text-purple-600 hover:text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
                  Select all approved
                </button>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {filtered.length} trainee{filtered.length !== 1 ? "s" : ""}
                {weekFilter.size > 0 && <span className="ml-1 text-purple-500 font-medium">· {weekLabel}</span>}
              </span>
            </div>

            {/* Threshold info strip */}
            {(currentThreshold.dataBundlePct > 0 || currentThreshold.stipendPct > 0) && (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                {currentThreshold.dataBundlePct > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    Data bundle: ≥{currentThreshold.dataBundlePct}%
                  </span>
                )}
                {currentThreshold.stipendPct > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                    Stipend: ≥{currentThreshold.stipendPct}%
                  </span>
                )}
                <span className="text-slate-300">— applied to Labs, KCs & Attendance</span>
              </div>
            )}
          </div>

          {/* ── Confirm issue ── */}
          {confirmIssue && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-4">
              <span className="text-sm text-amber-800">
                Issue <strong>{selectedCount}</strong> voucher{selectedCount !== 1 ? "s" : ""} ({issueExamType}) from pool ({poolCount} available)?
              </span>
              <button onClick={handleIssueVouchers} disabled={isPending} className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">Confirm</button>
              <button onClick={() => setConfirmIssue(false)} className="text-xs text-amber-700 hover:text-amber-900">Cancel</button>
            </div>
          )}

          {/* ── Table ── */}
          {!filtered.length ? (
            <div className="py-12 text-center text-sm text-slate-400">No trainees found.</div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" className="rounded border-slate-300"
                        checked={selectedCount === filtered.length && filtered.length > 0}
                        onChange={(e) => { if (e.target.checked) setSelectedIds(new Set(filtered.map((r) => r.traineeId))); else setSelectedIds(new Set()); }} />
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Trainer</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Cohort</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 w-8">#</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Name</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Email</th>
                    {level === "associate" && <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Amalitech Email</th>}
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Labs</th>
                    {level === "practitioner" && <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">KCs</th>}
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Attendance</th>
                    {currentThreshold.dataBundlePct > 0 && <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Data Bundle</th>}
                    {currentThreshold.stipendPct     > 0 && <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Stipend</th>}
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Quiz Scores</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Exam Approved</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Voucher</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Deadline</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Appointment</th>
                    <th className="px-3 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const { labsDone, labsTotal, kcsDone, kcsTotal, sessionsAttended, sessionsTotal } = getStats(r);
                    const labPct  = pct(labsDone, labsTotal);
                    const kcPct   = pct(kcsDone,  kcsTotal);
                    const attPct  = pct(sessionsAttended, sessionsTotal);
                    // Eligibility = min of the three rates (must meet threshold on all three)
                    const lowestPct = (labPct !== null || kcPct !== null || attPct !== null)
                      ? Math.min(labPct ?? Infinity, kcPct ?? Infinity, attPct ?? Infinity)
                      : null;
                    const dbElig  = eligibility(lowestPct, currentThreshold.dataBundlePct);
                    const stipElig = eligibility(lowestPct, currentThreshold.stipendPct);
                    return (
                      <tr key={r.traineeId} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(r.traineeId) ? "bg-purple-50" : ""}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded border-slate-300" checked={selectedIds.has(r.traineeId)} onChange={() => toggleSelect(r.traineeId)} />
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{r.trainerName}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{r.cohortCode}</td>
                        <td className="px-3 py-3 text-xs text-slate-400 tabular-nums">{r.serialNo ?? "—"}</td>
                        <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">{r.fullName}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{r.personalEmail}</td>
                        {level === "associate" && <td className="px-3 py-3 text-xs text-slate-500">{r.amalitechEmail ?? "—"}</td>}
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
                            ? <span className={attPct !== null && attPct >= 75 ? "text-green-600 font-medium" : attPct !== null && attPct >= 50 ? "text-amber-600" : "text-red-600"}>{sessionsAttended}/{sessionsTotal}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {currentThreshold.dataBundlePct > 0 && (
                          <td className="px-3 py-3"><EligBadge status={dbElig} /></td>
                        )}
                        {currentThreshold.stipendPct > 0 && (
                          <td className="px-3 py-3"><EligBadge status={stipElig} /></td>
                        )}
                        <td className="px-3 py-3">
                          <button onClick={() => setQuizPanelRow(r)} className="text-xs text-purple-600 hover:text-purple-700 underline underline-offset-2">View</button>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {r.examApproved
                            ? <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="Exam approved"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {r.issuedVoucher ? (
                            revealedCodes.has(r.traineeId) ? (
                              <button onClick={() => setRevealedCodes((p) => { const n = new Set(p); n.delete(r.traineeId); return n; })} title="Click to hide">
                                <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">{r.issuedVoucher}</code>
                              </button>
                            ) : (
                              <button
                                onClick={() => setRevealedCodes((p) => new Set([...p, r.traineeId]))}
                                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors group"
                                title="Click to reveal code"
                              >
                                <code className="font-mono text-slate-300">{r.issuedVoucher.slice(0, 4)}••••</code>
                                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {r.issuedVoucherId ? (
                            <button onClick={() => openDeadlinePicker(r)}
                              className={`text-xs underline underline-offset-2 whitespace-nowrap ${r.voucherDeadline ? "text-amber-600 hover:text-amber-700" : "text-slate-400 hover:text-slate-600"}`}>
                              {r.voucherDeadline ? new Date(r.voucherDeadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Set deadline"}
                            </button>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {r.examAppointment ? (
                            <div className="text-[10px] text-slate-600 space-y-0.5">
                              <div>{r.examAppointment.examDate}</div>
                              <div className="text-slate-400">{r.examAppointment.examTime}</div>
                              <div className="text-slate-400 max-w-[140px] truncate" title={r.examAppointment.examLocation}>{r.examAppointment.examLocation}</div>
                            </div>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {r.issuedVoucherId && (
                            <button onClick={() => handleRevoke(r)} disabled={isPending} title="Revoke voucher"
                              className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
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
      </div>

      {/* ── Revoked Vouchers ── */}
      {revokedVouchers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowRevoked((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">Revoked Vouchers</span>
              <span className="text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{revokedVouchers.length}</span>
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${showRevoked ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showRevoked && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Trainee</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Cohort</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Voucher Code</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Attempt #</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Revoked At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {revokedVouchers.map((rv) => {
                    const trainee = rows.find((r) => r.traineeId === rv.traineeId);
                    return (
                      <tr key={rv.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <p className="text-xs font-medium text-slate-800">{trainee?.fullName ?? "—"}</p>
                          <p className="text-[10px] text-slate-400">{trainee?.personalEmail ?? ""}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{trainee?.cohortCode ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {rv.voucherCode
                            ? <code className="text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{rv.voucherCode}</code>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">{rv.attemptNo}</td>
                        <td className="px-4 py-2.5 text-xs text-red-500 whitespace-nowrap">
                          {new Date(rv.revokedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Deadline picker modal ── */}
      {deadlineRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Set voucher deadline</h3>
            <p className="text-xs text-slate-500">{deadlineRow.fullName} — the voucher will be automatically revoked after this date if the trainee has not submitted their official exam scores.</p>
            <input type="date" value={deadlineVal} onChange={(e) => setDeadlineVal(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="flex gap-3">
              <button onClick={handleSetDeadline} disabled={isPending}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
                {isPending ? "Saving…" : "Save deadline"}
              </button>
              {deadlineRow.voucherDeadline && (
                <button onClick={() => { setDeadlineVal(""); handleSetDeadline(); }}
                  className="px-3 py-2 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50">
                  Clear
                </button>
              )}
              <button onClick={() => setDeadlineRow(null)} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

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
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Mock Exam Quiz Scores</p>
              {(() => {
                const cohortQuizzes = allQuizzes.filter((q) => q.cohortId === quizPanelRow.cohortId);
                const scoreMap = new Map(quizPanelRow.quizScores.map((qs) => [qs.quizId, qs.score]));
                if (!cohortQuizzes.length) return <p className="text-sm text-slate-400">No quizzes configured for this cohort.</p>;
                const taken = cohortQuizzes.filter((q) => scoreMap.has(q.id));
                return (
                  <div className="space-y-1">
                    {cohortQuizzes.map((quiz) => {
                      const score = scoreMap.get(quiz.id);
                      const p = score !== undefined ? Math.round((score / quiz.maxScore) * 100) : null;
                      return (
                        <div key={quiz.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-medium text-slate-800 truncate">{quiz.quizName}</p>
                            <p className="text-xs text-slate-400">Week {quiz.weekNumber}</p>
                          </div>
                          {score !== undefined
                            ? <div className="shrink-0 text-right">
                                <span className={`text-xs font-semibold tabular-nums ${p! >= 70 ? "text-green-600" : p! >= 50 ? "text-amber-600" : "text-red-500"}`}>{score}/{quiz.maxScore}</span>
                                <span className="text-xs text-slate-400 ml-1">({p}%)</span>
                              </div>
                            : <span className="shrink-0 text-xs text-slate-300 italic">not taken</span>}
                        </div>
                      );
                    })}
                    {taken.length > 0 && (
                      <div className="pt-3 border-t border-slate-200">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Average ({taken.length} quiz{taken.length !== 1 ? "zes" : ""})</span>
                          <span className="font-semibold text-slate-700">
                            {Math.round(taken.reduce((s, q) => s + (scoreMap.get(q.id)! / q.maxScore) * 100, 0) / taken.length)}%
                          </span>
                        </div>
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
