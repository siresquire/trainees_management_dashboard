"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { uploadAdminVoucherPool, issueVouchersToTrainees, type ExamType } from "@/actions/admin-vouchers";

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
};

type Props = {
  level:                   "practitioner" | "associate";
  rows:                    AdminTraineeRow[];
  poolCountPractitioner:   number;
  poolCountAssociate:      number;
};

export default function AdminDashboardClient({
  level,
  rows,
  poolCountPractitioner,
  poolCountAssociate,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery,    setSearchQuery]    = useState("");
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [showUpload,     setShowUpload]     = useState(false);
  const [voucherText,    setVoucherText]    = useState("");
  const [uploadLevel,    setUploadLevel]    = useState<"practitioner" | "associate">(level);
  const [issueExamType,  setIssueExamType]  = useState<ExamType>(level === "associate" ? "SAA-C03" : "CCP");
  const [confirmIssue,   setConfirmIssue]   = useState(false);

  const levelRows = useMemo(
    () => rows.filter((r) => r.cohortLevel === level),
    [rows, level]
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return levelRows;
    const q = searchQuery.toLowerCase();
    return levelRows.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.personalEmail.toLowerCase().includes(q)
    );
  }, [levelRows, searchQuery]);

  const poolCount = level === "associate" ? poolCountAssociate : poolCountPractitioner;

  function switchLevel(l: "practitioner" | "associate") {
    router.push(`/admin/dashboard?level=${l}`);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllApproved() {
    const approvedIds = filtered
      .filter((r) => r.examApproved && !r.issuedVoucher)
      .map((r) => r.traineeId);
    setSelectedIds(new Set(approvedIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleUpload() {
    const codes = voucherText
      .split(/[\n,]+/)
      .map((c) => c.trim())
      .filter(Boolean);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Voucher issuance and trainee readiness across all cohorts</p>
          </div>

          {/* Voucher pool status */}
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

        {/* ── Level tabs ── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1">
              {(["practitioner", "associate"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLevel(l)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                    level === l
                      ? "bg-purple-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

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
                  <button
                    onClick={clearSelection}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Clear
                  </button>
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
            </div>
          </div>

          {/* ── Confirm dialog ── */}
          {confirmIssue && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-4">
              <span className="text-sm text-amber-800">
                Issue <strong>{selectedCount}</strong> voucher{selectedCount !== 1 ? "s" : ""} ({issueExamType}) from the pool ({poolCount} available)?
              </span>
              <button
                onClick={handleIssueVouchers}
                disabled={isPending}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmIssue(false)}
                className="text-xs text-amber-700 hover:text-amber-900"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Table ── */}
          {!filtered.length ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No trainees found for this level.
            </div>
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
                  {filtered.map((r) => (
                    <tr
                      key={r.traineeId}
                      className={`hover:bg-slate-50 transition-colors ${selectedIds.has(r.traineeId) ? "bg-purple-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={selectedIds.has(r.traineeId)}
                          onChange={() => toggleSelect(r.traineeId)}
                        />
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
                        {r.labsTotal > 0 ? (
                          <span className={r.labsDone >= r.labsTotal ? "text-green-600 font-medium" : "text-slate-600"}>
                            {r.labsDone}/{r.labsTotal}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      {level === "practitioner" && (
                        <td className="px-3 py-3 text-xs tabular-nums">
                          {r.kcsTotal > 0 ? (
                            <span className={r.kcsDone >= r.kcsTotal ? "text-green-600 font-medium" : "text-slate-600"}>
                              {r.kcsDone}/{r.kcsTotal}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-3 text-xs tabular-nums">
                        {r.sessionsTotal > 0 ? (
                          <span className={
                            r.sessionsAttended / r.sessionsTotal >= 0.75
                              ? "text-green-600 font-medium"
                              : r.sessionsAttended / r.sessionsTotal >= 0.5
                              ? "text-amber-600"
                              : "text-red-600"
                          }>
                            {r.sessionsAttended}/{r.sessionsTotal}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <a
                          href={`/trainer/cohorts/${r.cohortId}/exams`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:text-purple-700 underline underline-offset-2"
                        >
                          View
                        </a>
                      </td>
                      <td className="px-3 py-3">
                        {r.examApproved ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                            ✓ Approved
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {r.issuedVoucher ? (
                          <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">
                            {r.issuedVoucher}
                          </code>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
