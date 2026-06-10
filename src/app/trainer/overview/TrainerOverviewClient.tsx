"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import type { TrainerOverviewCohort, TraineeSummary, WeeklyTrendRow } from "./page";

const COLORS = ["#f97316", "#8b5cf6", "#10b981", "#3b82f6", "#f43f5e", "#06b6d4", "#84cc16"];

function pct(done: number, total: number) {
  if (total === 0) return 0;
  // Clamp at 100 — protects against legacy data anomalies inflating ratios
  return Math.min(100, Math.round((done / total) * 100));
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

/** Chart tooltip showing code name, full cohort name, and the trainer responsible. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CohortTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const meta = payload[0]?.payload as { fullName?: string | null; trainer?: string | null } | undefined;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs max-w-[260px]">
      <p className="font-semibold text-slate-900">{label}</p>
      {meta?.fullName && meta.fullName !== label && (
        <p className="text-slate-500 mt-0.5">{meta.fullName}</p>
      )}
      {meta?.trainer && (
        <p className="text-slate-400 mt-0.5">Trainer: <span className="text-slate-600 font-medium">{meta.trainer}</span></p>
      )}
      <div className="mt-1.5 space-y-0.5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((p: any) => (
          <p key={String(p.dataKey)} style={{ color: p.color }} className="font-medium">
            {p.name}: {p.value === null || p.value === undefined ? "—" : `${p.value}%`}
          </p>
        ))}
      </div>
    </div>
  );
}

type Level = "all" | "practitioner" | "associate";

type Props = {
  cohorts: TrainerOverviewCohort[];
  traineesByCohort: Record<string, TraineeSummary[]>;
  weeklyTrend: WeeklyTrendRow[];
};

export default function TrainerOverviewClient({ cohorts, traineesByCohort, weeklyTrend }: Props) {
  const [levelFilter, setLevelFilter]           = useState<Level>("all");
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [cohortFilter, setCohortFilter]         = useState<Set<string>>(new Set());
  const [chartMode, setChartMode]               = useState<"grouped" | "stacked">("grouped");
  const [hoverSeries, setHoverSeries]           = useState<string | null>(null);
  const [hoverIdx, setHoverIdx]                 = useState<number | null>(null);

  // Cohorts matching the level filter — drives the cohort-chip list
  const levelCohorts = useMemo(
    () => levelFilter === "all" ? cohorts : cohorts.filter((c) => c.level === levelFilter),
    [cohorts, levelFilter]
  );

  // Final working set: level filter + (optional) specific-cohort selection
  const filtered = useMemo(
    () => cohortFilter.size === 0 ? levelCohorts : levelCohorts.filter((c) => cohortFilter.has(c.id)),
    [levelCohorts, cohortFilter]
  );

  function toggleCohort(id: string) {
    setCohortFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Series focus: hover dims the other series; CLICK pins the isolation
  // (click the same series or the legend again to unpin)
  const [pinnedSeries, setPinnedSeries] = useState<string | null>(null);
  const activeSeries = pinnedSeries ?? hoverSeries;
  const fade = (key: string) => (activeSeries !== null && activeSeries !== key ? 0.15 : 1);
  const togglePin = (key: string) => setPinnedSeries((p) => (p === key ? null : key));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legendHover = (e: any) => setHoverSeries(String(e?.dataKey ?? e?.value ?? ""));
  const legendLeave = () => setHoverSeries(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legendClick = (e: any) => togglePin(String(e?.dataKey ?? e?.value ?? ""));
  // Cohort fade synced to the tooltip's active index — same source of truth,
  // so the highlight can never lag behind the tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartMove = (s: any) =>
    setHoverIdx(s?.isTooltipActive ? (typeof s.activeTooltipIndex === "number" ? s.activeTooltipIndex : null) : null);
  const stackId = chartMode === "stacked" ? "s" : undefined;

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
    fullName:   c.name,
    trainer:    c.trainerName,
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

  // ── Performance matrix (replaces radar — works for any cohort count) ─────
  const matrixData = filtered.map((c) => ({
    name:       c.codeName,
    id:         c.id,
    fullName:   c.name,
    trainer:    c.trainerName,
    Labs:       pct(c.labsDoneTotal, c.labsTotal),
    KCs:        pct(c.kcsDoneTotal,  c.kcsTotal),
    Attendance: pct(c.sessionsAttended, c.sessionsTotal),
  }));

  const selectedCohort = filtered.find((c) => c.id === selectedCohortId) ?? null;
  const drilldownTrainees = selectedCohortId ? (traineesByCohort[selectedCohortId] ?? []) : [];

  // ── Weekly trend line chart (aggregated across filtered cohorts) ──────────
  const trendData = useMemo(() => {
    const filteredIds = new Set(filtered.map((c) => c.id));
    const byWeek = new Map<number, { labsDone: number; labsTotal: number; kcsDone: number; kcsTotal: number; attDone: number; attTotal: number }>();
    for (const r of weeklyTrend) {
      if (!filteredIds.has(r.cohortId)) continue;
      const w = byWeek.get(r.week) ?? { labsDone: 0, labsTotal: 0, kcsDone: 0, kcsTotal: 0, attDone: 0, attTotal: 0 };
      w.labsDone += r.labsDone; w.labsTotal += r.labsTotal;
      w.kcsDone  += r.kcsDone;  w.kcsTotal  += r.kcsTotal;
      w.attDone  += r.attDone;  w.attTotal  += r.attTotal;
      byWeek.set(r.week, w);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a - b)
      .map(([week, w]) => ({
        name:       `Wk ${week}`,
        Labs:       w.labsTotal > 0 ? pct(w.labsDone, w.labsTotal) : null,
        KCs:        w.kcsTotal  > 0 ? pct(w.kcsDone,  w.kcsTotal)  : null,
        Attendance: w.attTotal  > 0 ? pct(w.attDone,  w.attTotal)  : null,
      }));
  }, [weeklyTrend, filtered]);

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
              onClick={() => { setLevelFilter(l); setCohortFilter(new Set()); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                levelFilter === l ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cohort filter chips — narrow the whole page to specific cohorts ── */}
      {levelCohorts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 -mt-4">
          <span className="text-xs text-slate-400 mr-1">Cohorts:</span>
          <button
            onClick={() => setCohortFilter(new Set())}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              cohortFilter.size === 0 ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {levelCohorts.map((c) => {
            const on = cohortFilter.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCohort(c.id)}
                title={`${c.name}${c.trainerName ? ` · ${c.trainerName}` : ""}`}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  on ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c.codeName}
              </button>
            );
          })}
        </div>
      )}

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
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Completion Rates by Cohort</h2>
              <p className="text-xs text-slate-400">Click a bar or legend item to isolate that metric (click again to reset) · click a table row below for trainee breakdown</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {(["grouped", "stacked"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    chartMode === m ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={barData}
              margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
              accessibilityLayer={false}
              onMouseMove={chartMove}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="%" domain={chartMode === "stacked" ? [0, 300] : [0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip content={<CohortTooltip />} isAnimationActive={false} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
                onMouseEnter={legendHover} onMouseLeave={legendLeave} onClick={legendClick} />
              {(["Labs", "KCs", "Attendance"] as const).map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId={stackId}
                  fill={key === "Labs" ? "#f97316" : key === "KCs" ? "#8b5cf6" : "#10b981"}
                  radius={chartMode === "stacked" ? undefined : [4, 4, 0, 0]}
                  style={{ cursor: "pointer" }}
                  opacity={fade(key)}
                  isAnimationActive={false}
                  onClick={() => togglePin(key)}
                >
                  {barData.map((_, i) => (
                    <Cell key={i} fillOpacity={hoverIdx === null || hoverIdx === i ? 1 : 0.3} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Weekly progress trend line chart ── */}
      {trendData.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Weekly Progress Trend</h2>
          <p className="text-xs text-slate-400 mb-4">Average completion per training week across the selected cohorts</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (v === null ? "—" : `${v}%`)} isAnimationActive={false} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
                onMouseEnter={legendHover} onMouseLeave={legendLeave} onClick={legendClick} />
              <Line type="monotone" dataKey="Labs"       stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls strokeOpacity={fade("Labs")}       isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => togglePin("Labs")} />
              <Line type="monotone" dataKey="KCs"        stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls strokeOpacity={fade("KCs")}        isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => togglePin("KCs")} />
              <Line type="monotone" dataKey="Attendance" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls strokeOpacity={fade("Attendance")} isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => togglePin("Attendance")} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Pie charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Voucher Issuance</h2>
          {totalTrainees > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart accessibilityLayer={false}>
                <Pie data={voucherPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                  isAnimationActive={false}
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {voucherPie.map((_, i) => <Cell key={i} fill={i === 0 ? "#f97316" : "#e2e8f0"} />)}
                </Pie>
                <Tooltip isAnimationActive={false} />
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
              <PieChart accessibilityLayer={false}>
                <Pie data={outcomePie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                  isAnimationActive={false}
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {outcomePie.map((_, i) => <Cell key={i} fill={outcomePieColors[i] ?? COLORS[i]} />)}
                </Pie>
                <Tooltip isAnimationActive={false} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 mt-6 text-center">No exam outcomes recorded yet</p>
          )}
        </div>
      </div>

      {/* ── Performance matrix ── */}
      {matrixData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Cohort Performance Comparison</h2>
          <p className="text-xs text-slate-400 mb-4">Labs, KCs, and Attendance completion % across cohorts</p>
          <ResponsiveContainer width="100%" height={Math.max(180, matrixData.length * (chartMode === "stacked" ? 36 : 64))}>
            <BarChart data={matrixData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 80 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={chartMode === "stacked" ? [0, 300] : [0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
              <Tooltip content={<CohortTooltip />} isAnimationActive={false} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
                onMouseEnter={legendHover} onMouseLeave={legendLeave} onClick={legendClick} />
              <Bar dataKey="Labs"       stackId={stackId} fill="#f97316" radius={chartMode === "stacked" ? undefined : [0, 4, 4, 0]} barSize={14} opacity={fade("Labs")}       isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => togglePin("Labs")} />
              <Bar dataKey="KCs"        stackId={stackId} fill="#8b5cf6" radius={chartMode === "stacked" ? undefined : [0, 4, 4, 0]} barSize={14} opacity={fade("KCs")}        isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => togglePin("KCs")} />
              <Bar dataKey="Attendance" stackId={stackId} fill="#10b981" radius={chartMode === "stacked" ? undefined : [0, 4, 4, 0]} barSize={14} opacity={fade("Attendance")} isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => togglePin("Attendance")} />
            </BarChart>
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
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">At risk</th>
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-slate-900">{c.codeName}</p>
                        {(c.name !== c.codeName || c.trainerName) && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {c.name !== c.codeName ? c.name : ""}
                            {c.name !== c.codeName && c.trainerName ? " · " : ""}
                            {c.trainerName ?? ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.level === "associate" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {c.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{c.totalTrainees}</td>
                      <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${color(labPct)}`}>{c.labsTotal > 0 ? `${labPct}%` : "—"}</td>
                      <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${color(kcPct)}`}>{c.kcsTotal > 0 ? `${kcPct}%` : "—"}</td>
                      <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${color(attPct, 75, 50)}`}>{c.sessionsTotal > 0 ? `${attPct}%` : "—"}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {c.atRiskCount > 0
                          ? <span className="font-semibold text-red-500">{c.atRiskCount}</span>
                          : <span className="text-green-600 font-medium">0</span>}
                      </td>
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
                        <td colSpan={10} className="px-4 py-0 bg-orange-50 border-b border-orange-100">
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

      {cohort.atRiskCount > 0 && (
        <p className="text-xs text-red-600 font-medium">
          ⚠ {cohort.atRiskCount} trainee{cohort.atRiskCount !== 1 ? "s" : ""}{" "}at risk
          (labs/KCs &lt; 80% of work assigned by the current week, or attendance &lt; 70%) —
          see the cohort&apos;s Analytics page for the full list
        </p>
      )}
    </div>
  );
}
