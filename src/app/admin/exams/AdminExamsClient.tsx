"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { bulkMarkVoucherIssued, bulkUpdateExamScheduleBatch } from "@/actions/exam-schedules";
import type { ExamScheduleRow } from "./page";

type Cohort = { id: string; name: string; code_name: string; level: string };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminExamsClient({
  rows,
  cohorts,
}: {
  rows:    ExamScheduleRow[];
  cohorts: Cohort[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery,   setSearchQuery]   = useState("");
  const [cohortFilter,  setCohortFilter]  = useState("");
  const [batchFilter,   setBatchFilter]   = useState("");
  const [voucherFilter, setVoucherFilter] = useState<"all" | "issued" | "pending">("all");
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());

  // Bulk batch assignment
  const [bulkBatchInput, setBulkBatchInput] = useState("");
  const [confirmBatch,   setConfirmBatch]   = useState(false);

  // Inline batch editing
  const [editingBatchFor,  setEditingBatchFor]  = useState<string | null>(null);
  const [inlineBatchInput, setInlineBatchInput] = useState("");

  const filtered = useMemo(() => {
    let result = rows;
    if (cohortFilter) result = result.filter((r) => r.cohortId === cohortFilter);
    if (batchFilter)  result = result.filter((r) => batchFilter === "unassigned" ? !r.batchNumber : String(r.batchNumber) === batchFilter);
    if (voucherFilter === "issued")  result = result.filter((r) => r.voucherIssued);
    if (voucherFilter === "pending") result = result.filter((r) => !r.voucherIssued);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        r.traineeName.toLowerCase().includes(q) ||
        r.personalEmail.toLowerCase().includes(q) ||
        r.firstName.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, cohortFilter, batchFilter, voucherFilter, searchQuery]);

  const selectedCount = selectedIds.size;
  const batchNumbers  = [...new Set(rows.map((r) => r.batchNumber).filter(Boolean) as number[])].sort((a, b) => a - b);

  function handleMarkVoucherIssued() {
    const scheduleIds = filtered.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    if (!scheduleIds.length) return;
    startTransition(async () => {
      const res = await bulkMarkVoucherIssued(scheduleIds, true);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Voucher marked as issued for ${scheduleIds.length} trainee${scheduleIds.length !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  function handleBulkBatch() {
    const n = parseInt(bulkBatchInput, 10);
    if (isNaN(n) || n < 1) { toast("Enter a valid batch number (≥1)", "error"); return; }
    const scheduleIds = filtered.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    if (!scheduleIds.length) return;
    setConfirmBatch(false);
    startTransition(async () => {
      const res = await bulkUpdateExamScheduleBatch(scheduleIds, n);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Batch ${n} assigned to ${scheduleIds.length} trainee${scheduleIds.length !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setBulkBatchInput("");
      router.refresh();
    });
  }

  function handleInlineBatchSave(scheduleId: string) {
    const n = parseInt(inlineBatchInput, 10);
    startTransition(async () => {
      const res = await bulkUpdateExamScheduleBatch([scheduleId], isNaN(n) ? 0 : n);
      if (res.error) { toast(res.error, "error"); return; }
      toast("Batch saved");
      setEditingBatchFor(null);
      router.refresh();
    });
  }

  function exportCsv() {
    const src = filtered;
    if (!src.length) { toast("No rows to export", "error"); return; }
    const headers = [
      "#", "Trainee Name", "First Name", "Last Name", "Other Names", "Personal Email",
      "Cohort", "Region", "AWS Account ID", "AWS Cert Email", "Canvas Grad Status",
      "Batch #", "Voucher Issued", "Cert Score", "Certified", "Submitted At",
    ];
    const csvRows = src.map((r) => [
      r.traineeSerialNo ?? "", r.traineeName, r.firstName, r.lastName, r.otherNames ?? "",
      r.personalEmail, r.cohortDisplayName, r.region, r.awsAccountId ?? "", r.awsCertEmail ?? "",
      r.canvasGradStatus, r.batchNumber ?? "", r.voucherIssued ? "Yes" : "No",
      r.certScore ?? "", r.certScore !== null ? (r.certScore >= r.passingScore ? "Yes" : "No") : "",
      fmtDate(r.submittedAt),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv  = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `exam-schedules-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Exam Registrations</h1>
          <p className="text-sm text-slate-500 mt-0.5">All trainee exam registrations across cohorts.</p>
        </div>
        <button onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-600 rounded-lg">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Registrations", value: rows.length, color: "text-slate-900" },
          { label: "Voucher Issued", value: rows.filter((r) => r.voucherIssued).length, color: "text-green-600" },
          { label: "Pending Voucher", value: rows.filter((r) => !r.voucherIssued).length, color: "text-amber-600" },
          { label: "Certified", value: rows.filter((r) => r.certScore !== null && r.certScore >= r.passingScore).length, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" placeholder="Search name or email…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-52 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 placeholder:text-slate-400" />

        <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
          <option value="">All cohorts</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
          <option value="">All batches</option>
          <option value="unassigned">Unassigned</option>
          {batchNumbers.map((b) => <option key={b} value={String(b)}>Batch {b}</option>)}
        </select>

        <select value={voucherFilter} onChange={(e) => setVoucherFilter(e.target.value as typeof voucherFilter)}
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
          <option value="all">All voucher statuses</option>
          <option value="issued">Voucher Issued</option>
          <option value="pending">Pending Voucher</option>
        </select>

        <span className="ml-auto text-xs text-slate-400">{filtered.length} registration{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bulk actions when rows are selected */}
      {selectedCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-orange-800 font-medium">{selectedCount} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-orange-600 hover:text-orange-800 underline">Clear</button>

          <button onClick={handleMarkVoucherIssued} disabled={isPending}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg whitespace-nowrap">
            Mark Voucher Issued
          </button>

          {!confirmBatch ? (
            <button onClick={() => setConfirmBatch(true)}
              className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg whitespace-nowrap">
              Assign Batch
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" min="1" placeholder="Batch #" value={bulkBatchInput}
                onChange={(e) => setBulkBatchInput(e.target.value)}
                className="w-20 border border-orange-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
              <button onClick={handleBulkBatch} disabled={isPending}
                className="px-3 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg">Confirm</button>
              <button onClick={() => { setConfirmBatch(false); setBulkBatchInput(""); }}
                className="text-xs text-orange-700 hover:text-orange-900">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {!filtered.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">{rows.length ? "No registrations match the current filters." : "No exam registrations yet."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" className="rounded border-slate-300"
                      checked={selectedCount === filtered.length && filtered.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filtered.map((r) => r.id)));
                        else setSelectedIds(new Set());
                      }} />
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 w-8">#</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Name</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Cohort</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Region</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Personal Email</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">AWS Account</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 w-28">Batch #</th>
                  <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-20">Voucher</th>
                  <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-20">Certified</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const certified = r.certScore !== null && r.certScore >= r.passingScore;
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50 ${selectedIds.has(r.id) ? "bg-orange-50" : ""}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="rounded border-slate-300"
                          checked={selectedIds.has(r.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id); else next.delete(r.id);
                              return next;
                            });
                          }} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400">{r.traineeSerialNo ?? "—"}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800 whitespace-nowrap">
                          {r.firstName} {r.lastName}
                          {r.otherNames && <span className="text-slate-400 font-normal"> {r.otherNames}</span>}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{r.trainerName}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{r.cohortDisplayName}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{r.region}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{r.personalEmail}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{r.awsAccountId ?? "—"}</td>
                      <td className="px-3 py-3">
                        {editingBatchFor === r.id ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min="1" value={inlineBatchInput}
                              onChange={(e) => setInlineBatchInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleInlineBatchSave(r.id); if (e.key === "Escape") setEditingBatchFor(null); }}
                              className="w-16 border border-orange-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                              autoFocus />
                            <button onClick={() => handleInlineBatchSave(r.id)} disabled={isPending}
                              className="text-green-600 hover:text-green-700 text-xs font-medium">✓</button>
                            <button onClick={() => setEditingBatchFor(null)}
                              className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingBatchFor(r.id); setInlineBatchInput(r.batchNumber ? String(r.batchNumber) : ""); }}
                            className="text-xs text-slate-700 hover:text-orange-600 font-medium group flex items-center gap-1"
                          >
                            {r.batchNumber ? `Batch ${r.batchNumber}` : <span className="text-slate-300 italic">— set</span>}
                            <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 text-orange-500" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.voucherIssued ? (
                          <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.certScore !== null ? (
                          <div className="text-center">
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${certified ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                              {certified ? "✓ Yes" : "✗ No"}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{r.certScore}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(r.submittedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
