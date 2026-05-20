"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import type { OverviewCohort } from "./page";

const COLORS = ["#f97316", "#8b5cf6", "#10b981", "#3b82f6", "#f43f5e", "#06b6d4", "#84cc16"];

function pct(done: number, total: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function StatCard({ label, value, sub, color = "text-slate-900" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

type Level = "all" | "practitioner" | "associate";

export default function AdminOverviewClient({ cohorts }: { cohorts: OverviewCohort[] }) {
  const [levelFilter, setLevelFilter] = useState<Level>("all");

  const filtered = useMemo(
    () => levelFilter === "all" ? cohorts : cohorts.filter((c) => c.level === levelFilter),
    [cohorts, levelFilter]
  );

  // ── Global KPIs ─────────────────────────────────────────────────────────
  const totalTrainees    = filtered.reduce((s, c) => s + c.totalTrainees, 0);
  const totalVouchers    = filtered.reduce((s, c) => s + c.vouchersIssued, 0);
  const totalPassed      = filtered.reduce((s, c) => s + c.examPassed, 0);
  const totalFailed      = filtered.reduce((s, c) => s + c.examFailed, 0);
  const overallLabPct    = pct(filtered.reduce((s, c) => s + c.labsDoneTotal, 0), filtered.reduce((s, c) => s + c.labsTotal, 0));
  const overallKcPct     = pct(filtered.reduce((s, c) => s + c.kcsDoneTotal, 0),  filtered.reduce((s, c) => s + c.kcsTotal, 0));
  const overallAttPct    = pct(filtered.reduce((s, c) => s + c.sessionsAttended, 0), filtered.reduce((s, c) => s + c.sessionsTotal, 0));
  const passRate         = totalPassed + totalFailed > 0 ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : null;

  // ── Per-cohort bar chart data ────────────────────────────────────────────
  const barData = filtered.map((c) => ({
    name:       c.codeName,
    Labs:       pct(c.labsDoneTotal, c.labsTotal),
    KCs:        pct(c.kcsDoneTotal,  c.kcsTotal),
    Attendance: pct(c.sessionsAttended, c.sessionsTotal),
  }));

  // ── Voucher issuance pie ────────────────────────────────────────────────
  const pieData = [
    { name: "Vouchers issued", value: totalVouchers },
    { name: "No voucher yet",  value: Math.max(0, totalTrainees - totalVouchers) },
  ];

  // ── Exam outcomes pie ───────────────────────────────────────────────────
  const outcomePie = [
    { name: "Passed", value: totalPassed },
    { name: "Failed", value: totalFailed },
    { name: "Pending", value: Math.max(0, totalVouchers - totalPassed - totalFailed) },
  ].filter((d) => d.value > 0);
  const outcomePieColors = ["#10b981", "#f43f5e", "#f97316"];

  // ── Radar chart (per cohort — only when ≤8 cohorts, else bar) ──────────
  const radarData = filtered.length <= 8 ? filtered.map((c) => ({
    cohort:     c.codeName,
    Labs:       pct(c.labsDoneTotal, c.labsTotal),
    KCs:        pct(c.kcsDoneTotal,  c.kcsTotal),
    Attendance: pct(c.sessionsAttended, c.sessionsTotal),
  })) : [];

  return (
    <div className="p-6 md:p-8 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Analytics Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Aggregate metrics across all active cohorts</p>
        </div>
        <div className="flex gap-1">
          {(["all", "practitioner", "associate"] as Level[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                levelFilter === l ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard label="Trainees"      value={totalTrainees} />
        <StatCard label="Cohorts"       value={filtered.length} />
        <StatCard label="Labs done"     value={`${overallLabPct}%`}  color={overallLabPct >= 80 ? "text-green-600" : overallLabPct >= 60 ? "text-amber-600" : "text-red-500"} />
        <StatCard label="KCs done"      value={`${overallKcPct}%`}   color={overallKcPct  >= 80 ? "text-green-600" : overallKcPct  >= 60 ? "text-amber-600" : "text-red-500"} />
        <StatCard label="Attendance"    value={`${overallAttPct}%`}  color={overallAttPct >= 75 ? "text-green-600" : overallAttPct >= 50 ? "text-amber-600" : "text-red-500"} />
        <StatCard label="Vouchers out"  value={totalVouchers} sub={`of ${totalTrainees} trainees`} />
        <StatCard label="Exam pass rate" value={passRate !== null ? `${passRate}%` : "—"} color={passRate !== null && passRate >= 70 ? "text-green-600" : "text-slate-900"} sub={`${totalPassed} passed / ${totalFailed} failed`} />
      </div>

      {/* ── Completion bar chart ── */}
      {barData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Completion Rates by Cohort</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Labs"       fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="KCs"        fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Attendance" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Voucher issuance pie ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Voucher Issuance</h2>
          {totalTrainees > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#f97316" : "#e2e8f0"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 mt-6 text-center">No data</p>
          )}
        </div>

        {/* ── Exam outcomes pie ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Exam Outcomes</h2>
          {outcomePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={outcomePie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {outcomePie.map((_, i) => (
                    <Cell key={i} fill={outcomePieColors[i] ?? COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 mt-6 text-center">No exam outcomes recorded yet</p>
          )}
        </div>
      </div>

      {/* ── Radar chart (≤8 cohorts) ── */}
      {radarData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Cohort Performance Radar</h2>
          <p className="text-xs text-slate-400 mb-4">Each axis shows the average completion % for Labs, KCs, and Attendance across the cohort's trainees.</p>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="cohort" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Labs"       dataKey="Labs"       stroke="#f97316" fill="#f97316" fillOpacity={0.18} />
              <Radar name="KCs"        dataKey="KCs"        stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.18} />
              <Radar name="Attendance" dataKey="Attendance" stroke="#10b981" fill="#10b981" fillOpacity={0.18} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Cohort summary table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-900">Cohort Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Cohort</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Trainer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Level</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Trainees</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Labs %</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">KCs %</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Attendance %</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Vouchers</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Pass / Fail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((c) => {
                const labPct = pct(c.labsDoneTotal, c.labsTotal);
                const kcPct  = pct(c.kcsDoneTotal,  c.kcsTotal);
                const attPct = pct(c.sessionsAttended, c.sessionsTotal);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{c.codeName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{c.trainerName}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.level === "associate" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {c.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{c.totalTrainees}</td>
                    <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${labPct >= 80 ? "text-green-600" : labPct >= 60 ? "text-amber-600" : labPct > 0 ? "text-red-500" : "text-slate-300"}`}>{c.labsTotal > 0 ? `${labPct}%` : "—"}</td>
                    <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${kcPct  >= 80 ? "text-green-600" : kcPct  >= 60 ? "text-amber-600" : kcPct  > 0 ? "text-red-500" : "text-slate-300"}`}>{c.kcsTotal > 0 ? `${kcPct}%` : "—"}</td>
                    <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${attPct >= 75 ? "text-green-600" : attPct >= 50 ? "text-amber-600" : attPct > 0 ? "text-red-500" : "text-slate-300"}`}>{c.sessionsTotal > 0 ? `${attPct}%` : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{c.vouchersIssued}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums">
                      {c.examPassed > 0 || c.examFailed > 0
                        ? <><span className="text-green-600 font-medium">{c.examPassed}</span><span className="text-slate-300"> / </span><span className="text-red-500 font-medium">{c.examFailed}</span></>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
