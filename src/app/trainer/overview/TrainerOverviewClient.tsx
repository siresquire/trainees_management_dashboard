"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import type { TrainerOverviewCohort, TraineeSummary } from "./page";

const COLORS = ["#f97316", "#8b5cf6", "#10b981", "#3b82f6", "#f43f5e", "#06b6d4", "#84cc16"];

function pct(done: number, total: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function color(v: number, threshHi = 80, threshMid = 60) {
  if (v >= threshHi) return "text-green-600";
  if (v >= threshMid) return "text-amber-600";
  if (v > 0) return "text-red-500";
  return "text-slate-300";
}

function StatCard({ label, value, sub, textColor = "text-slate-900" }: {
  label: string; value: string | number; sub?: string; textColor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${textColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

type Level = "all" | "practitioner" | "associate";

type Props = {
  cohorts: TrainerOverviewCohort[];
  traineesByCohort: Record<string, TraineeSummary[]>;
};

export default function TrainerOverviewClient({ cohorts, traineesByCohort }: Props) {
  const [levelFilter, setLevelFilter]       = useState<Level>("all");
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);

  const filtered = useMemo(
    () => levelFilter === "all" ? cohorts : cohorts.filter((c) => c.level === levelFilter),
    [cohorts, levelFilter]
  );

  // ── Global KPIs ─────────────────────────────────────────────────────────
  const totalTrainees = filtered.reduce((s, c) => s + c.totalTrainees, 0);
  const totalVouchers = filtered.reduce((s, c) => s + c.vouchersIssued, 0);
  const totalPassed   = filtered.reduce((s, c) => s + c.examPassed, 0);
  const totalFailed   = filtered.reduce((s, c) => s + c.examFailed, 0);
  const overallLabPct = pct(filtered.reduce((s, c) => s + c.labsDoneTotal, 0), filtered.reduce((s, c) => s + c.labsTotal, 0));
  const overallKcPct  = pct(filtered.reduce((s, c) => s + c.kcsDoneTotal, 0),  filtered.reduce((s, c) => s + c.kcsTotal, 0));
  const overallAttPct = pct(filtered.reduce((s, c) => s + c.sessionsAttended, 0), filtered.reduce((s, c) => s + c.sessionsTotal, 0));
  const passRate      = totalPassed + totalFailed > 0 ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : null;

  // ── Bar chart data ───────────────────────────────────────────────────────
  const barData = filtered.map((c) => ({
    name:       c.codeName,
    id:         c.id,
    Labs:       pct(c.labsDoneTotal, c.labsTotal),
    KCs:        pct(c.kcsDoneTotal,  c.kcsTotal),
    Attendance: pct(c.sessionsAttended, c.sessionsTotal),
  }));

  // ── Pie charts ───────────────────────────────────────────────────────────
  const voucherPie = [
    { name: "Vouchers issued", value: totalVouchers },
    { name: "No voucher yet",  value: Math.max(0, totalTrainees - totalVouchers) },
  ];
  const outcomePie = [
    { name: "Passed",  value: totalPassed },
    { name: "Failed",  value: totalFailed },
    { name: "Pending", value: Math.max(0, totalVouchers - totalPassed - totalFailed) },
  ].filter((d) => d.value > 0);
  const outcomePieColors = ["#10b981", "#f43f5e", "#f97316"];

  // ── Radar ────────────────────────────────────────────────────────────────
  const radarData = filtered.length <= 8 ? filtered.map((c) => ({
    cohort:     c.codeName,
    Labs:       pct(c.labsDoneTotal, c.labsTotal),
    KCs:        pct(c.kcsDoneTotal,  c.kcsTotal),
    Attendance: pct(c.sessionsAttended, c.sessionsTotal),
  })) : [];

  const selectedCohort = filtered.find((c) => c.id === selectedCohortId) ?? null;
  const drilldownTrainees = selectedCohortId ? (traineesByCohort[selectedCohortId] ?? []) : [];

  return (
    <div className="p-6 md:p-8 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Analytics Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Aggregate metrics across your active cohorts</p>
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
        <StatCard label="Trainees"       value={totalTrainees} />
        <StatCard label="Cohorts"        value={filtered.length} />
        <StatCard label="Labs done"      value={`${overallLabPct}%`}  textColor={color(overallLabPct)} />
        <StatCard label="KCs done"       value={`${overallKcPct}%`}   textColor={color(overallKcPct)} />
        <StatCard label="Attendance"     value={`${overallAttPct}%`}  textColor={color(overallAttPct, 75, 50)} />
        <StatCard label="Vouchers out"   value={totalVouchers} sub={`of ${totalTrainees} trainees`} />
        <StatCard label="Exam pass rate" value={passRate !== null ? `${passRate}%` : "—"} textColor={passRate !== null && passRate >= 70 ? "text-green-600" : "text-slate-900"} sub={`${totalPassed} passed / ${totalFailed} failed`} />
      </div>

      {/* ── Completion bar chart (clickable bars) ── */}
      {barData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Completion Rates by Cohort</h2>
          <p className="text-xs text-slate-400 mb-4">Click a bar group to see trainee breakdown below</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Labs"       fill="#f97316" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }}
                onClick={(d) => { const id = (d.payload as { id?: string })?.id; if (id) setSelectedCohortId((p) => (p === id ? null : id)); }} />
              <Bar dataKey="KCs"        fill="#8b5cf6" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }}
                onClick={(d) => { const id = (d.payload as { id?: string })?.id; if (id) setSelectedCohortId((p) => (p === id ? null : id)); }} />
              <Bar dataKey="Attendance" fill="#10b981" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }}
                onClick={(d) => { const id = (d.payload as { id?: string })?.id; if (id) setSelectedCohortId((p) => (p === id ? null : id)); }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Pie charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Voucher Issuance</h2>
          {totalTrainees > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={voucherPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {voucherPie.map((_, i) => <Cell key={i} fill={i === 0 ? "#f97316" : "#e2e8f0"} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 mt-6 text-center">No data</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Exam Outcomes</h2>
          {outcomePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={outcomePie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {outcomePie.map((_, i) => <Cell key={i} fill={outcomePieColors[i] ?? COLORS[i]} />)}
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
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Cohort Performance Radar</h2>
          <p className="text-xs text-slate-400 mb-4">Comparison of Labs, KCs, and Attendance completion % across cohorts</p>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis dataKey="cohort" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Labs"       dataKey="Labs"       stroke="#f97316" fill="#f97316" fillOpacity={0.3} strokeWidth={2} dot={true} />
              <Radar name="KCs"        dataKey="KCs"        stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} strokeWidth={2} dot={true} />
              <Radar name="Attendance" dataKey="Attendance" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} dot={true} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Cohort summary table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Cohort Summary</h2>
          <p className="text-xs text-slate-400">Click a row to see trainee breakdown · Open analytics for deep dive</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Cohort</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Level</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Trainees</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Labs %</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">KCs %</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Attendance %</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Vouchers</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Pass / Fail</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((c) => {
                const labPct = pct(c.labsDoneTotal, c.labsTotal);
                const kcPct  = pct(c.kcsDoneTotal,  c.kcsTotal);
                const attPct = pct(c.sessionsAttended, c.sessionsTotal);
                const isSelected = selectedCohortId === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => setSelectedCohortId((prev) => (prev === c.id ? null : c.id))}
                      className={`cursor-pointer transition-colors ${isSelected ? "bg-orange-50" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{c.codeName}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.level === "associate" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {c.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{c.totalTrainees}</td>
                      <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${color(labPct)}`}>{c.labsTotal > 0 ? `${labPct}%` : "—"}</td>
                      <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${color(kcPct)}`}>{c.kcsTotal > 0 ? `${kcPct}%` : "—"}</td>
                      <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${color(attPct, 75, 50)}`}>{c.sessionsTotal > 0 ? `${attPct}%` : "—"}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{c.vouchersIssued}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {c.examPassed > 0 || c.examFailed > 0
                          ? <><span className="text-green-600 font-medium">{c.examPassed}</span><span className="text-slate-300"> / </span><span className="text-red-500 font-medium">{c.examFailed}</span></>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/trainer/cohorts/${c.id}/analytics`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-orange-500 hover:text-orange-700 font-medium whitespace-nowrap"
                        >
                          Analytics →
                        </Link>
                      </td>
                    </tr>

                    {/* Inline drilldown panel */}
                    {isSelected && (
                      <tr>
                        <td colSpan={9} className="px-4 py-0 bg-orange-50 border-b border-orange-100">
                          <DrilldownPanel cohort={selectedCohort} trainees={drilldownTrainees} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No cohorts found for the selected filter.</p>
        </div>
      )}
    </div>
  );
}

// ── Drilldown panel ───────────────────────────────────────────────────────────

function DrilldownPanel({
  cohort,
  trainees,
}: {
  cohort: TrainerOverviewCohort | null;
  trainees: TraineeSummary[];
}) {
  if (!cohort) return null;

  const top = trainees.slice(0, 10);
  const atRisk = trainees.filter((t) => t.labPct < 50 && (t.kcPct < 50 || cohort.kcsTotal === 0));

  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-orange-700">
          {cohort.codeName} — top trainees by completion
        </p>
        <Link
          href={`/trainer/cohorts/${cohort.id}/analytics`}
          className="text-xs font-medium text-orange-600 hover:text-orange-800 border border-orange-200 bg-white px-3 py-1 rounded-lg"
        >
          Open full analytics →
        </Link>
      </div>

      {top.length === 0 ? (
        <p className="text-xs text-slate-400">No trainee data yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-orange-100 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-orange-50">
                <th className="text-left px-3 py-2 font-medium text-slate-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Name</th>
                <th className="text-right px-3 py-2 font-medium text-slate-500">Labs</th>
                {cohort.kcsTotal > 0 && <th className="text-right px-3 py-2 font-medium text-slate-500">KCs</th>}
                <th className="text-right px-3 py-2 font-medium text-slate-500">Attend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {top.map((t, i) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{t.name}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${t.labPct >= 80 ? "text-green-600" : t.labPct >= 60 ? "text-amber-600" : t.labPct > 0 ? "text-red-500" : "text-slate-300"}`}>
                    {t.labPct}%
                  </td>
                  {cohort.kcsTotal > 0 && (
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${t.kcPct >= 80 ? "text-green-600" : t.kcPct >= 60 ? "text-amber-600" : t.kcPct > 0 ? "text-red-500" : "text-slate-300"}`}>
                      {t.kcPct}%
                    </td>
                  )}
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${t.attendPct >= 75 ? "text-green-600" : t.attendPct >= 50 ? "text-amber-600" : t.attendPct > 0 ? "text-red-500" : "text-slate-300"}`}>
                    {t.attendPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {atRisk.length > 0 && (
        <p className="text-xs text-red-600 font-medium">
          ⚠ {atRisk.length} trainee{atRisk.length !== 1 ? "s" : ""} at risk (labs &lt; 50%)
        </p>
      )}
    </div>
  );
}
