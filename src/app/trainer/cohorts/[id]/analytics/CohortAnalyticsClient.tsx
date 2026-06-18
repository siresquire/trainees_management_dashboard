"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
  ScatterChart, Scatter, ReferenceLine,
  Cell,
  type ScatterShapeProps,
} from "recharts";
import type { CohortAnalyticsData, TraineeAnalytic } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(done: number, total: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function scoreColor(v: number, hiThresh = 80, midThresh = 60) {
  if (v >= hiThresh) return "text-green-600";
  if (v >= midThresh) return "text-amber-600";
  if (v > 0) return "text-red-500";
  return "text-slate-300";
}

function scoreBg(v: number, hiThresh = 80, midThresh = 60) {
  if (v >= hiThresh) return "bg-green-100 text-green-700";
  if (v >= midThresh) return "bg-amber-100 text-amber-700";
  if (v > 0) return "bg-red-100 text-red-600";
  return "bg-slate-100 text-slate-400";
}

function overallPct(t: TraineeAnalytic, labTotal: number, kcTotal: number) {
  const lp = pct(t.labDone, labTotal);
  if (kcTotal === 0) return lp;
  const kp = pct(t.kcDone, kcTotal);
  return Math.round((lp + kp) / 2);
}

// Spread stacked points apart so co-located trainees don't invisibly overlap
function jitter(id: string, salt: string, range = 2.5): number {
  let h = 0;
  const s = id + salt;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return ((((h >>> 0) % 1000) / 1000) - 0.5) * range * 2;
}

// Colour by actual position; at-risk flag is shown as a ring, not colour override
function dotFill(labP: number, attP: number): string {
  if (labP >= 80 && attP >= 80) return "#22c55e";   // green — both strong
  if (labP >= 60 && attP >= 60) return "#f97316";   // orange — moderate
  if (labP >= 40 || attP >= 40) return "#f59e0b";   // amber — one axis weak
  return "#ef4444";                                  // red — both weak
}

function heatCell(done: number, total: number): { bg: string; text: string; label: string } {
  if (total === 0) return { bg: "bg-slate-50",   text: "text-slate-300", label: "—"   };
  const p = Math.round((done / total) * 100);
  if (p >= 100) return { bg: "bg-green-100", text: "text-green-700", label: "✓"      };
  if (p >= 80)  return { bg: "bg-green-50",  text: "text-green-600", label: `${p}%`  };
  if (p >= 50)  return { bg: "bg-amber-100", text: "text-amber-700", label: `${p}%`  };
  if (p > 0)    return { bg: "bg-red-100",   text: "text-red-600",   label: `${p}%`  };
  return           { bg: "bg-red-50",    text: "text-red-400",   label: "0"     };
}

function StatCard({ label, value, sub, textColor = "text-slate-900" }: {
  label: string; value: string | number; sub?: string; textColor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

type SortKey  = "name" | "lab" | "kc" | "att" | "overall";
type HeatTab  = "leaderboard" | "labs" | "kcs";

// ── Week heatmap component ────────────────────────────────────────────────────

function WeekHeatmap({
  trainees,
  weekTotals,
  metric,
  totalForMetric,
}: {
  trainees: TraineeAnalytic[];
  weekTotals: { week: number; labTotal: number; kcTotal: number }[];
  metric: "labs" | "kcs";
  totalForMetric: number;
}) {
  if (weekTotals.length === 0 || trainees.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">No weekly data available yet.</p>;
  }

  const sorted = [...trainees].sort((a, b) => {
    const da = metric === "labs" ? a.labDone : a.kcDone;
    const db = metric === "labs" ? b.labDone : b.kcDone;
    return pct(db, totalForMetric) - pct(da, totalForMetric);
  });

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left px-4 py-2.5 font-medium text-slate-500 whitespace-nowrap sticky left-0 bg-white z-10 min-w-[160px]">
              Trainee
            </th>
            {weekTotals.map((wt) => {
              const weekMax = metric === "labs" ? wt.labTotal : wt.kcTotal;
              return (
                <th key={wt.week} className="text-center px-1.5 py-2 font-medium text-slate-500 whitespace-nowrap min-w-[52px]">
                  W{wt.week}
                  {weekMax > 0 && (
                    <span className="block text-slate-300 font-normal">/{weekMax}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
              <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[1px_0_0_0_#f1f5f9]">
                {t.name}
              </td>
              {weekTotals.map((wt) => {
                const wd    = t.weekData.find((w) => w.week === wt.week);
                const done  = metric === "labs" ? (wd?.labDone ?? 0) : (wd?.kcDone ?? 0);
                const total = metric === "labs" ? wt.labTotal         : wt.kcTotal;
                const { bg, text, label } = heatCell(done, total);
                return (
                  <td
                    key={wt.week}
                    className={`px-1 py-2 text-center font-semibold ${bg} ${text}`}
                    title={total > 0 ? `${done}/${total} (${Math.round((done / total) * 100)}%)` : "No tasks this week"}
                  >
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Week detail panel (unchanged) ─────────────────────────────────────────────

function WeekDetailPanel({
  trainee,
  labTotal,
  kcTotal,
  weekTotals,
}: {
  trainee: TraineeAnalytic;
  labTotal: number;
  kcTotal: number;
  weekTotals: { week: number; labTotal: number; kcTotal: number }[];
}) {
  const weekData = weekTotals.map((wt) => {
    const d = trainee.weekData.find((w) => w.week === wt.week);
    return {
      name:    `W${wt.week}`,
      LabDone: d?.labDone  ?? 0,
      LabTot:  wt.labTotal,
      KcDone:  d?.kcDone   ?? 0,
      KcTot:   wt.kcTotal,
    };
  });

  const barData = weekData.map((w) => ({
    name: w.name,
    Labs: w.LabTot > 0 ? Math.round((w.LabDone / w.LabTot) * 100) : 0,
    KCs:  w.KcTot  > 0 ? Math.round((w.KcDone  / w.KcTot)  * 100) : 0,
  }));

  return (
    <div className="py-4">
      <p className="text-xs font-semibold text-orange-700 mb-3">{trainee.name} — weekly breakdown</p>
      {weekData.length === 0 ? (
        <p className="text-xs text-slate-400">No weekly data available yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => `${v}%`} />
            {labTotal > 0 && <Bar dataKey="Labs" fill="#f97316" radius={[3, 3, 0, 0]} />}
            {kcTotal > 0 && <Bar dataKey="KCs" fill="#8b5cf6" radius={[3, 3, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-orange-100">
              <th className="text-left px-2 py-1 font-medium text-slate-500">Week</th>
              {labTotal > 0 && <th className="text-right px-2 py-1 font-medium text-slate-500">Labs</th>}
              {kcTotal > 0 && <th className="text-right px-2 py-1 font-medium text-slate-500">KCs</th>}
            </tr>
          </thead>
          <tbody>
            {weekData.map((w) => (
              <tr key={w.name} className="border-b border-orange-50">
                <td className="px-2 py-1 font-medium text-slate-600">{w.name}</td>
                {labTotal > 0 && (
                  <td className="px-2 py-1 text-right text-slate-600 tabular-nums">
                    {w.LabDone}/{w.LabTot}
                    {w.LabTot > 0 && (
                      <span className={`ml-1 font-medium ${pct(w.LabDone, w.LabTot) >= 80 ? "text-green-600" : pct(w.LabDone, w.LabTot) >= 60 ? "text-amber-600" : w.LabDone > 0 ? "text-red-500" : "text-slate-300"}`}>
                        ({Math.round((w.LabDone / w.LabTot) * 100)}%)
                      </span>
                    )}
                  </td>
                )}
                {kcTotal > 0 && (
                  <td className="px-2 py-1 text-right text-slate-600 tabular-nums">
                    {w.KcDone}/{w.KcTot}
                    {w.KcTot > 0 && (
                      <span className={`ml-1 font-medium ${pct(w.KcDone, w.KcTot) >= 80 ? "text-green-600" : pct(w.KcDone, w.KcTot) >= 60 ? "text-amber-600" : w.KcDone > 0 ? "text-red-500" : "text-slate-300"}`}>
                        ({Math.round((w.KcDone / w.KcTot) * 100)}%)
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CohortAnalyticsClient({ data }: { data: CohortAnalyticsData }) {
  const { trainees, labTotal, kcTotal, totalSessions, weekTotals, cohortId, atRisk } = data;
  const atRiskIds  = new Set(atRisk.map((r) => r.traineeId));
  const currentWeek = atRisk[0]?.currentWeek ?? null;

  const [sortKey,    setSortKey]    = useState<SortKey>("overall");
  const [sortDir,    setSortDir]    = useState<"desc" | "asc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [histBucket, setHistBucket] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [heatTab,    setHeatTab]    = useState<HeatTab>("leaderboard");

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const avgLabPct = trainees.length > 0
    ? Math.round(trainees.reduce((s, t) => s + pct(t.labDone,  labTotal),       0) / trainees.length) : 0;
  const avgKcPct  = trainees.length > 0 && kcTotal > 0
    ? Math.round(trainees.reduce((s, t) => s + pct(t.kcDone,   kcTotal),        0) / trainees.length) : 0;
  const avgAttPct = trainees.length > 0 && totalSessions > 0
    ? Math.round(trainees.reduce((s, t) => s + pct(t.attended, totalSessions),  0) / trainees.length) : 0;

  // ── Progress histogram ───────────────────────────────────────────────────────
  const BUCKETS = ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"];
  const histData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const t of trainees) {
      const ov  = overallPct(t, labTotal, kcTotal);
      const idx = Math.min(Math.floor(ov / 20), 4);
      counts[idx]++;
    }
    return BUCKETS.map((label, i) => ({ label, count: counts[i], bucket: i }));
  }, [trainees, labTotal, kcTotal]);

  // ── Cumulative area chart data ───────────────────────────────────────────────
  const areaData = useMemo(() => {
    if (!weekTotals.length || !trainees.length) return [];
    return weekTotals.map((wt) => {
      const avgLab = labTotal > 0
        ? Math.round(trainees.reduce((s, t) => {
            const done = t.weekData.filter((w) => w.week <= wt.week).reduce((a, w) => a + w.labDone, 0);
            return s + pct(done, labTotal);
          }, 0) / trainees.length)
        : 0;
      const avgKc = kcTotal > 0
        ? Math.round(trainees.reduce((s, t) => {
            const done = t.weekData.filter((w) => w.week <= wt.week).reduce((a, w) => a + w.kcDone, 0);
            return s + pct(done, kcTotal);
          }, 0) / trainees.length)
        : 0;
      return { name: `W${wt.week}`, Labs: avgLab, ...(kcTotal > 0 ? { KCs: avgKc } : {}) };
    });
  }, [trainees, weekTotals, labTotal, kcTotal]);

  // ── Scatter data ─────────────────────────────────────────────────────────────
  const scatterData = useMemo(() => trainees.map((t) => ({
    id:     t.id,
    name:   t.name,
    // Raw percentages kept for the tooltip
    labPct: pct(t.labDone,  labTotal),
    attPct: pct(t.attended, totalSessions),
    kcPct:  pct(t.kcDone,   kcTotal),
    // Jittered coordinates so co-located trainees don't render as a single dot
    labJ:   Math.min(100, Math.max(0, pct(t.labDone,  labTotal)    + jitter(t.id, "l"))),
    attJ:   Math.min(100, Math.max(0, pct(t.attended, totalSessions) + jitter(t.id, "a"))),
    atRisk: atRiskIds.has(t.id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [trainees, labTotal, kcTotal, totalSessions, atRisk]);

  // ── Filtered + sorted leaderboard ────────────────────────────────────────────
  const filteredTrainees = useMemo(() => {
    let list = trainees;
    if (histBucket !== null) {
      const lo = histBucket * 20;
      const hi = lo + 20;
      list = list.filter((t) => {
        const ov = overallPct(t, labTotal, kcTotal);
        return ov >= lo && (histBucket === 4 ? ov <= 100 : ov < hi);
      });
    }
    return [...list].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === "name")    { va = a.name.localeCompare(b.name); return sortDir === "asc" ? va : -va; }
      if (sortKey === "lab")     { va = pct(a.labDone,  labTotal);        vb = pct(b.labDone,  labTotal);        }
      if (sortKey === "kc")      { va = pct(a.kcDone,   kcTotal);         vb = pct(b.kcDone,   kcTotal);         }
      if (sortKey === "att")     { va = pct(a.attended, totalSessions);   vb = pct(b.attended, totalSessions);   }
      if (sortKey === "overall") { va = overallPct(a, labTotal, kcTotal); vb = overallPct(b, labTotal, kcTotal); }
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [trainees, histBucket, sortKey, sortDir, labTotal, kcTotal, totalSessions]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? <span className="ml-0.5">{sortDir === "desc" ? "↓" : "↑"}</span>
    : <span className="ml-0.5 opacity-30">↕</span>;

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
      active ? "bg-orange-100 text-orange-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-8">

      {/* ── Current week + KPI cards ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cohort Overview</p>
          {currentWeek !== null && (
            <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
              Training Week {currentWeek}
            </span>
          )}
        </div>
        <div className={`grid grid-cols-2 gap-4 ${kcTotal > 0 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
          <StatCard label="Trainees"   value={trainees.length} />
          <StatCard label="Avg Labs"   value={`${avgLabPct}%`}  textColor={scoreColor(avgLabPct)} />
          {kcTotal > 0 && <StatCard label="Avg KCs" value={`${avgKcPct}%`} textColor={scoreColor(avgKcPct)} />}
          <StatCard label="Attendance" value={`${avgAttPct}%`}  textColor={scoreColor(avgAttPct, 75, 50)} />
          <StatCard
            label="At Risk"
            value={atRisk.length}
            textColor={atRisk.length > 0 ? "text-red-600" : "text-slate-900"}
            sub={atRisk.length > 0 ? "behind by current week" : "all on track"}
          />
        </div>
      </div>

      {/* ── Histogram + Scatter ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Progress distribution histogram */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Progress Distribution</h2>
          <p className="text-xs text-slate-400 mb-4">
            Overall completion % buckets ·{" "}
            {histBucket !== null
              ? <button onClick={() => setHistBucket(null)} className="text-orange-500 underline">clear filter</button>
              : "click a bar to filter the leaderboard"}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={histData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v} trainee${Number(v) !== 1 ? "s" : ""}`} />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                style={{ cursor: "pointer" }}
                onClick={(d) => {
                  const b = (d.payload as { bucket?: number })?.bucket;
                  if (b !== undefined) setHistBucket((prev) => (prev === b ? null : b));
                }}
              >
                {histData.map((d, i) => (
                  <Cell key={i} fill={histBucket === i ? "#f97316" : "#fdba74"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Scatter: lab % vs attendance % — 3-colour scale */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Exam Readiness Scatter</h2>
          <p className="text-xs text-slate-400 mb-1">Lab completion vs attendance</p>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {[
              { color: "#22c55e", label: "Both ≥ 80%" },
              { color: "#f97316", label: "Moderate (60–80%)" },
              { color: "#f59e0b", label: "One axis weak" },
              { color: "#ef4444", label: "Both weak" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-red-500" style={{ background: "transparent" }} />
              At risk (ring)
            </span>
          </div>
          {totalSessions > 0 && labTotal > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="labJ" name="Labs" unit="%" type="number" domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "Labs %", position: "insideBottom", offset: -8, fontSize: 10 }}
                />
                <YAxis
                  dataKey="attJ" name="Attendance" unit="%" type="number" domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "Attend %", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                {/* 80 % reference lines divide chart into performance quadrants */}
                <ReferenceLine x={80} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={1} />
                <ReferenceLine y={80} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={1} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload as (typeof scatterData)[0];
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-md">
                        <p className="font-semibold text-slate-800 mb-1">{d.name}</p>
                        <p className="text-slate-500">Labs: <span className="font-medium text-slate-700">{d.labPct}%</span></p>
                        {kcTotal > 0 && <p className="text-slate-500">KCs: <span className="font-medium text-slate-700">{d.kcPct}%</span></p>}
                        <p className="text-slate-500">Attendance: <span className="font-medium text-slate-700">{d.attPct}%</span></p>
                        {d.atRisk && <p className="text-red-500 font-semibold mt-1">At risk</p>}
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={scatterData}
                  onClick={(d) => {
                    const id = (d as { id?: string }).id;
                    if (id) { setHighlightId((prev) => (prev === id ? null : id)); setExpandedId(id); }
                  }}
                  shape={(props: ScatterShapeProps) => {
                    const p      = props.payload as { atRisk?: boolean; id?: string; labPct: number; attPct: number } | undefined;
                    const isHL   = highlightId === p?.id;
                    const isRisk = p?.atRisk ?? false;
                    const fill   = dotFill(p?.labPct ?? 0, p?.attPct ?? 0);
                    const stroke = isHL ? "#1e293b" : isRisk ? "#dc2626" : "#fff";
                    const sw     = isHL ? 2.5 : isRisk ? 2 : 1;
                    return (
                      <circle
                        cx={props.cx ?? 0} cy={props.cy ?? 0}
                        r={isHL ? 10 : 7}
                        fill={fill}
                        fillOpacity={0.85}
                        stroke={stroke}
                        strokeWidth={sw}
                        style={{ cursor: "pointer" }}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 mt-8 text-center">No attendance or lab data yet</p>
          )}
        </div>
      </div>

      {/* ── Cumulative area chart ── */}
      {areaData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Week-over-Week Completion (Cumulative Avg)</h2>
          <p className="text-xs text-slate-400 mb-4">
            Average % of total tasks completed by all trainees up to each week
            {currentWeek !== null && (
              <span className="ml-2 font-medium text-orange-600">· Current week: {currentWeek}</span>
            )}
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={areaData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="labGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="kcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone" dataKey="Labs" stroke="#f97316" strokeWidth={2.5}
                fill="url(#labGrad)" dot={{ r: 4, fill: "#f97316" }} activeDot={{ r: 6 }}
              />
              {kcTotal > 0 && (
                <Area
                  type="monotone" dataKey="KCs" stroke="#8b5cf6" strokeWidth={2.5}
                  fill="url(#kcGrad)" dot={{ r: 4, fill: "#8b5cf6" }} activeDot={{ r: 6 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Leaderboard + heatmap tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <button className={tabCls(heatTab === "leaderboard")} onClick={() => setHeatTab("leaderboard")}>
              Leaderboard
            </button>
            {labTotal > 0 && weekTotals.length > 0 && (
              <button className={tabCls(heatTab === "labs")} onClick={() => setHeatTab("labs")}>
                Labs by Week
              </button>
            )}
            {kcTotal > 0 && weekTotals.length > 0 && (
              <button className={tabCls(heatTab === "kcs")} onClick={() => setHeatTab("kcs")}>
                KCs by Week
              </button>
            )}
          </div>

          {heatTab === "leaderboard" ? (
            <div className="flex items-center gap-3">
              {histBucket !== null && (
                <p className="text-xs text-orange-600">
                  Filtered: {BUCKETS[histBucket]} — {filteredTrainees.length} trainee{filteredTrainees.length !== 1 ? "s" : ""} ·{" "}
                  <button onClick={() => setHistBucket(null)} className="underline">clear</button>
                </p>
              )}
              <p className="text-xs text-slate-400">Click a row for week detail</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-100 inline-block" /> Complete</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 inline-block" /> Partial</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-50 inline-block" /> Not started</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-50 inline-block" /> No tasks</span>
            </div>
          )}
        </div>

        {/* Leaderboard table */}
        {heatTab === "leaderboard" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">#</th>
                  <th onClick={() => toggleSort("name")} className="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700">
                    Name <SortIcon k="name" />
                  </th>
                  <th onClick={() => toggleSort("lab")} className="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap">
                    Labs <SortIcon k="lab" />
                  </th>
                  {kcTotal > 0 && (
                    <th onClick={() => toggleSort("kc")} className="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap">
                      KCs <SortIcon k="kc" />
                    </th>
                  )}
                  <th onClick={() => toggleSort("att")} className="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap">
                    Attendance <SortIcon k="att" />
                  </th>
                  <th onClick={() => toggleSort("overall")} className="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap">
                    Overall <SortIcon k="overall" />
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTrainees.map((t, i) => {
                  const labP = pct(t.labDone,  labTotal);
                  const kcP  = pct(t.kcDone,   kcTotal);
                  const attP = pct(t.attended, totalSessions);
                  const ov   = overallPct(t, labTotal, kcTotal);
                  const isOpen = expandedId === t.id;
                  const isHL   = highlightId === t.id;

                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        onClick={() => { setExpandedId((p) => (p === t.id ? null : t.id)); setHighlightId(t.id); }}
                        className={`cursor-pointer transition-colors ${isHL || isOpen ? "bg-orange-50" : "hover:bg-slate-50"}`}
                      >
                        <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{t.name}</td>
                        <td className={`px-4 py-3 text-right text-xs tabular-nums font-semibold ${scoreColor(labP)}`}>
                          {labTotal > 0 ? `${labP}%` : "—"}
                          {labTotal > 0 && <span className="ml-1 text-slate-300 font-normal">({t.labDone}/{labTotal})</span>}
                        </td>
                        {kcTotal > 0 && (
                          <td className={`px-4 py-3 text-right text-xs tabular-nums font-semibold ${scoreColor(kcP)}`}>
                            {kcP}%
                            <span className="ml-1 text-slate-300 font-normal">({t.kcDone}/{kcTotal})</span>
                          </td>
                        )}
                        <td className={`px-4 py-3 text-right text-xs tabular-nums font-semibold ${scoreColor(attP, 75, 50)}`}>
                          {totalSessions > 0 ? `${attP}%` : "—"}
                          {totalSessions > 0 && <span className="ml-1 text-slate-300 font-normal">({t.attended}/{totalSessions})</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBg(ov)}`}>{ov}%</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/trainer/cohorts/${cohortId}/trainees/${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-slate-400 hover:text-orange-600 transition-colors"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={kcTotal > 0 ? 7 : 6} className="px-4 py-0 bg-orange-50 border-b border-orange-100">
                            <WeekDetailPanel
                              trainee={t} labTotal={labTotal} kcTotal={kcTotal}
                              weekTotals={weekTotals}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {filteredTrainees.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No trainees in this range.</p>
            )}
          </div>
        )}

        {/* Labs heatmap */}
        {heatTab === "labs" && (
          <WeekHeatmap
            trainees={trainees} weekTotals={weekTotals}
            metric="labs" totalForMetric={labTotal}
          />
        )}

        {/* KCs heatmap */}
        {heatTab === "kcs" && (
          <WeekHeatmap
            trainees={trainees} weekTotals={weekTotals}
            metric="kcs" totalForMetric={kcTotal}
          />
        )}
      </div>

      {/* ── At-risk panel ── */}
      {atRisk.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-red-700 mb-3">
            At-Risk Trainees ({atRisk.length})
          </h2>
          <p className="text-xs text-red-500 mb-4">
            Below 80% of Labs{kcTotal > 0 ? " or KCs" : ""} assigned through week {currentWeek ?? "—"}, or attendance below 70% — may need intervention
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {atRisk.map((t) => {
              const labP = pct(t.labsDone, t.labsExpected);
              const kcP  = pct(t.kcsDone,  t.kcsExpected);
              const attP = pct(t.attDone,  t.attTotal);
              return (
                <Link
                  key={t.traineeId}
                  href={`/trainer/cohorts/${cohortId}/trainees/${t.traineeId}`}
                  className="bg-white border border-red-100 rounded-xl px-4 py-3 hover:border-red-300 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800 truncate mb-1">{t.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {t.labsExpected > 0 && (
                      <span className={`font-medium ${labP < 80 ? "text-red-600" : "text-green-600"}`}>
                        Labs {t.labsDone}/{t.labsExpected} ({labP}%)
                      </span>
                    )}
                    {t.kcsExpected > 0 && (
                      <span className={`font-medium ${kcP < 80 ? "text-red-600" : "text-green-600"}`}>
                        KCs {t.kcsDone}/{t.kcsExpected} ({kcP}%)
                      </span>
                    )}
                    {t.attTotal > 0 && (
                      <span className={`font-medium ${attP < 70 ? "text-red-600" : "text-green-600"}`}>
                        Att {t.attDone}/{t.attTotal} ({attP}%)
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
