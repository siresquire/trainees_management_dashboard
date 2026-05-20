"use client";

import { useState, useTransition } from "react";
import {
  deleteAdminVoucherPoolEntry,
  deleteAdminVoucherPoolEntries,
  updateAdminVoucherPoolCode,
  deleteRevokedVoucher,
  restoreRevokedVoucherToPool,
} from "@/actions/admin-vouchers";

type PoolEntry = { id: string; code: string; level: "practitioner" | "associate"; isUsed: boolean; revokedAt: string | null; createdAt: string };
type VoucherEntry = {
  id: string; code: string | null; examType: string; issuedDate: string;
  attemptNo: number; deadline: string | null; revokedAt: string | null;
  traineeId: string; traineeName: string; traineeEmail: string;
  cohortLevel: "practitioner" | "associate";
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function VouchersClient({ pool, vouchers }: { pool: PoolEntry[]; vouchers: VoucherEntry[] }) {
  const [level, setLevel] = useState<"practitioner" | "associate">("practitioner");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [revokedError, setRevokedError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const levelPool     = pool.filter((p) => p.level === level);
  const levelVouchers = vouchers.filter((v) => v.cohortLevel === level);

  const available = levelPool.filter((p) => !p.isUsed && !p.revokedAt);
  const issued    = levelVouchers.filter((v) => !v.revokedAt);
  const revoked   = levelVouchers.filter((v) => v.revokedAt);

  function toggleReveal(id: string) {
    setRevealedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function toggleSelectAll() {
    if (selectedIds.size === available.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(available.map((p) => p.id)));
    }
  }

  function startEdit(entry: PoolEntry) {
    setEditingId(entry.id);
    setEditValue(entry.code);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setEditError(null);
  }

  function handleSaveEdit(id: string) {
    setEditError(null);
    startTransition(async () => {
      const res = await updateAdminVoucherPoolCode(id, editValue);
      if (res.error) { setEditError(res.error); return; }
      setEditingId(null);
    });
  }

  function handleDelete(id: string) {
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteAdminVoucherPoolEntry(id);
      if (res.error) setDeleteError(res.error);
      else setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    });
  }

  function handleDeleteRevoked(id: string) {
    setRevokedError(null);
    startTransition(async () => {
      const res = await deleteRevokedVoucher(id);
      if (res.error) setRevokedError(res.error);
    });
  }

  function handleRestoreToPool(id: string) {
    setRevokedError(null);
    startTransition(async () => {
      const res = await restoreRevokedVoucherToPool(id);
      if (res.error) setRevokedError(res.error);
    });
  }

  function handleBulkDelete() {
    if (!selectedIds.size) return;
    setDeleteError(null);
    const ids = [...selectedIds];
    startTransition(async () => {
      const res = await deleteAdminVoucherPoolEntries(ids);
      if (res.error) setDeleteError(res.error);
      else setSelectedIds(new Set());
    });
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Vouchers</h1>
        <p className="text-sm text-slate-500 mt-0.5">Pool inventory and issuance status by level</p>
      </div>

      {/* Level tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(["practitioner", "associate"] as const).map((l) => (
          <button key={l} onClick={() => { setLevel(l); setSelectedIds(new Set()); setEditingId(null); }}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${level === l ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>}
          label="Available" count={available.length} color="slate"
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          label="Issued" count={issued.length} color="green"
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          label="Revoked" count={revoked.length} color="red"
        />
      </div>

      {/* Issued */}
      <Section title="Issued" count={issued.length} defaultOpen>
        {issued.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-4">No vouchers issued yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Trainee</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Exam</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Voucher Code</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Issued</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Deadline</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-center">Attempt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {issued.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-slate-800">{v.traineeName}</p>
                    <p className="text-[10px] text-slate-400">{v.traineeEmail}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{v.examType}</td>
                  <td className="px-4 py-2.5">
                    {v.code ? (
                      revealedIds.has(v.id) ? (
                        <button onClick={() => toggleReveal(v.id)} title="Click to hide">
                          <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">{v.code}</code>
                        </button>
                      ) : (
                        <button onClick={() => toggleReveal(v.id)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 group" title="Click to reveal">
                          <code className="font-mono">{v.code.slice(0, 4)}••••</code>
                          <svg className="w-3 h-3 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                      )
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(v.issuedDate)}</td>
                  <td className="px-4 py-2.5">
                    {v.deadline
                      ? <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${new Date(v.deadline) < new Date() ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>{fmtDate(v.deadline)}</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums text-center">#{v.attemptNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Revoked */}
      <Section title="Revoked" count={revoked.length}>
        {revoked.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-4">No revoked vouchers.</p>
        ) : (
          <>
            {revokedError && (
              <p className="text-xs text-red-600 px-4 py-2 bg-red-50 border-b border-red-100">{revokedError}</p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Trainee</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Exam</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Voucher Code</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Issued</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Revoked</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-center">Attempt</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {revoked.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 opacity-75 hover:opacity-100 transition-opacity">
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-slate-700">{v.traineeName}</p>
                      <p className="text-[10px] text-slate-400">{v.traineeEmail}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{v.examType}</td>
                    <td className="px-4 py-2.5">
                      {v.code
                        ? <code className="text-xs font-mono text-slate-400 line-through">{v.code}</code>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{fmtDate(v.issuedDate)}</td>
                    <td className="px-4 py-2.5 text-xs text-red-500 whitespace-nowrap">{v.revokedAt ? fmtDate(v.revokedAt) : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 tabular-nums text-center">#{v.attemptNo}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {/* Restore to available pool */}
                        <button
                          onClick={() => handleRestoreToPool(v.id)}
                          disabled={isPending}
                          title="Return code to available pool"
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50 whitespace-nowrap"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restore
                        </button>
                        {/* Delete permanently */}
                        <button
                          onClick={() => handleDeleteRevoked(v.id)}
                          disabled={isPending}
                          title="Delete permanently"
                          className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* Available pool */}
      <Section title="Available Pool" count={available.length}>
        {available.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-4">No codes available. Upload more from the Trainees dashboard.</p>
        ) : (
          <>
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border-b border-red-100">
                <span className="text-xs text-red-700 font-medium">{selectedIds.size} selected</span>
                <button
                  onClick={handleBulkDelete}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete selected
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">
                  Cancel
                </button>
              </div>
            )}
            {deleteError && (
              <p className="text-xs text-red-600 px-4 py-2 bg-red-50 border-b border-red-100">{deleteError}</p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === available.length && available.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Code</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Added</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {available.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 ${selectedIds.has(p.id) ? "bg-orange-50" : ""}`}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(p.id); if (e.key === "Escape") cancelEdit(); }}
                            className="text-xs font-mono border border-orange-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-400 w-40"
                            autoFocus
                          />
                          <button onClick={() => handleSaveEdit(p.id)} disabled={isPending} className="text-xs text-green-600 hover:text-green-700 font-medium disabled:opacity-50">Save</button>
                          <button onClick={cancelEdit} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                          {editError && <span className="text-xs text-red-500">{editError}</span>}
                        </div>
                      ) : (
                        revealedIds.has(p.id) ? (
                          <button onClick={() => toggleReveal(p.id)} title="Click to hide">
                            <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">{p.code}</code>
                          </button>
                        ) : (
                          <button onClick={() => toggleReveal(p.id)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 group" title="Click to reveal">
                            <code className="font-mono">{p.code.slice(0, 4)}••••</code>
                            <svg className="w-3 h-3 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {editingId !== p.id && (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                            title="Edit code"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={isPending}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Delete code"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>
    </div>
  );
}

function StatCard({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: "slate" | "green" | "red" }) {
  const iconColor = color === "green" ? "text-green-500 bg-green-50" : color === "red" ? "text-red-500 bg-red-50" : "text-slate-500 bg-slate-100";
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{count}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function Section({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{count}</span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-slate-100 overflow-x-auto">{children}</div>}
    </div>
  );
}
