"use client";

import { useState } from "react";

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

  const levelPool     = pool.filter((p) => p.level === level);
  const levelVouchers = vouchers.filter((v) => v.cohortLevel === level);

  const available = levelPool.filter((p) => !p.isUsed && !p.revokedAt);
  const issued    = levelVouchers.filter((v) => !v.revokedAt);
  const revoked   = levelVouchers.filter((v) => v.revokedAt);

  function toggleReveal(id: string) {
    setRevealedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
          <button key={l} onClick={() => setLevel(l)}
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Trainee</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Exam</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Voucher Code</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Issued</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Revoked</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-center">Attempt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {revoked.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 opacity-75">
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Available pool */}
      <Section title="Available Pool" count={available.length}>
        {available.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-4">No codes available. Upload more from the Trainees dashboard.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Code</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {available.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    {revealedIds.has(p.id) ? (
                      <button onClick={() => toggleReveal(p.id)} title="Click to hide">
                        <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">{p.code}</code>
                      </button>
                    ) : (
                      <button onClick={() => toggleReveal(p.id)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 group" title="Click to reveal">
                        <code className="font-mono">{p.code.slice(0, 4)}••••</code>
                        <svg className="w-3 h-3 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
