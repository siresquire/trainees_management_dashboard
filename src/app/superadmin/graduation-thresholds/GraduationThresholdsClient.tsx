"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { GradRow } from "./page";

function pct(done: number, total: number) {
  if (total === 0) return null;
  return Math.round((done / total) * 100);
}

function PctBadge({ done, total }: { done: number; total: number }) {
  const p = pct(done, total);
  if (p === null) return <span className="text-slate-300">—</span>;
  const cls =
    p >= 80 ? "text-green-600" : p >= 60 ? "text-amber-600" : p > 0 ? "text-red-500" : "text-slate-300";
  return (
    <span className={`tabular-nums font-semibold ${cls}`}>
      {done}/{total}
      <span className="ml-1 font-normal text-slate-400">({p}%)</span>
    </span>
  );
}

export default function GraduationThresholdsClient({ rows }: { rows: GradRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  const displayRows = useMemo(() => {
    const base = showAll ? rows : rows.filter((r) => r.graduated);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (r) =>
        r.traineeName.toLowerCase().includes(q) ||
        r.cohortName.toLowerCase().includes(q) ||
        r.cohortCode.toLowerCase().includes(q),
    );
  }, [rows, showAll, search]);

  // Per-cohort summary (only graduated trainees contribute to minimums)
  const cohortSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        cohortCode:     string;
        cohortName:     string;
        total:          number;
        graduated:      number;
        labsTotal:      number;
        kcsTotal:       number;
        // trainee with minimum combined completions who graduated
        minTraineeName: string;
        minLabs:        number;
        minKcs:         number;
      }
    >();

    for (const r of rows) {
      if (!map.has(r.cohortId)) {
        map.set(r.cohortId, {
          cohortCode:     r.cohortCode,
          cohortName:     r.cohortName,
          total:          0,
          graduated:      0,
          labsTotal:      r.labsTotal,
          kcsTotal:       r.kcsTotal,
          minTraineeName: "",
          minLabs:        Infinity,
          minKcs:         Infinity,
        });
      }
      const e = map.get(r.cohortId)!;
      e.total++;
      if (r.graduated) {
        e.graduated++;
        // Track trainee with the lowest combined completion who still graduated
        if (r.labsDone + r.kcsDone < e.minLabs + e.minKcs) {
          e.minLabs        = r.labsDone;
          e.minKcs         = r.kcsDone;
          e.minTraineeName = r.traineeName;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.cohortName.localeCompare(b.cohortName));
  }, [rows]);

  const totalGraduated = rows.filter((r) => r.graduated).length;

  // ── Excel export ────────────────────────────────────────────────────────────
  function handleExport() {
    // Sheet 1 — all trainees (graduates first)
    const allRows = rows.map((r) => ({
      "Cohort Code":        r.cohortCode,
      "Cohort Name":        r.cohortName,
      "Trainee Name":       r.traineeName,
      "Labs Done":          r.labsDone,
      "Labs Total":         r.labsTotal,
      "Labs %":             r.labsTotal > 0 ? `${Math.round((r.labsDone / r.labsTotal) * 100)}%` : "—",
      "KCs Done":           r.kcsDone,
      "KCs Total":          r.kcsTotal,
      "KCs %":              r.kcsTotal > 0 ? `${Math.round((r.kcsDone / r.kcsTotal) * 100)}%` : "—",
      "Graduation Status":  r.graduated ? "Graduated" : "Not Graduated",
    }));

    // Sheet 2 — per-cohort summary
    const summaryRows = cohortSummary.map((s) => ({
      "Cohort Code":            s.cohortCode,
      "Cohort Name":            s.cohortName,
      "Total Trainees":         s.total,
      "Graduated":              s.graduated,
      "Graduation Rate":        `${Math.round((s.graduated / s.total) * 100)}%`,
      "Min Labs (Graduated)":   s.minLabs === Infinity ? "—" : s.minLabs,
      "Min KCs (Graduated)":    s.minKcs  === Infinity ? "—" : s.minKcs,
      "Min Trainee Example":    s.minTraineeName || "—",
      "Total Labs Available":   s.labsTotal,
      "Total KCs Available":    s.kcsTotal,
      "Min Labs %":             s.labsTotal > 0 && s.minLabs !== Infinity
        ? `${Math.round((s.minLabs / s.labsTotal) * 100)}%` : "—",
      "Min KCs %":              s.kcsTotal > 0 && s.minKcs !== Infinity
        ? `${Math.round((s.minKcs / s.kcsTotal) * 100)}%` : "—",
    }));

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(allRows);
    // Auto-fit columns
    ws1["!cols"] = [14, 30, 30, 10, 10, 8, 8, 8, 6, 16].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, "All Trainees");

    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2["!cols"] = [14, 30, 14, 12, 14, 18, 16, 30, 20, 20, 10, 10].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, "Cohort Summary");

    XLSX.writeFile(wb, "practitioner_graduation_thresholds.xlsx");
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Graduation Thresholds</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Labs &amp; KC completions at the time of Canvas graduation · Practitioner cohorts only
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Export to Excel
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Practitioner Cohorts" value={cohortSummary.length} />
        <KpiCard label="Total Trainees" value={rows.length} />
        <KpiCard label="Graduated" value={totalGraduated} highlight />
        <KpiCard
          label="Graduation Rate"
          value={rows.length > 0 ? `${Math.round((totalGraduated / rows.length) * 100)}%` : "—"}
        />
      </div>

      {/* ── Per-cohort summary ── */}
      {cohortSummary.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">
              Minimum graduation thresholds per cohort
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              The row shows the trainee who graduated with the fewest total completions —
              i.e. the floor Canvas accepted for that cohort.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="text-left px-4 py-3">Cohort Code</th>
                  <th className="text-left px-4 py-3">Cohort Name</th>
                  <th className="text-right px-4 py-3">Graduated</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Grad Rate</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Min Labs</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Min KCs</th>
                  <th className="text-left px-4 py-3">Example Trainee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cohortSummary.map((s) => {
                  const labMinPct = s.labsTotal > 0 && s.minLabs !== Infinity
                    ? Math.round((s.minLabs / s.labsTotal) * 100) : null;
                  const kcMinPct  = s.kcsTotal  > 0 && s.minKcs  !== Infinity
                    ? Math.round((s.minKcs  / s.kcsTotal)  * 100) : null;
                  return (
                    <tr key={s.cohortCode} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.cohortCode}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.cohortName}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-green-600 font-semibold">{s.graduated}</span>
                        <span className="text-slate-300 text-xs ml-1">/ {s.total}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-slate-600">
                        {Math.round((s.graduated / s.total) * 100)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.minLabs === Infinity ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className="tabular-nums">
                            <span className="font-semibold text-slate-800">{s.minLabs}</span>
                            <span className="text-slate-400 text-xs ml-1">/ {s.labsTotal}</span>
                            {labMinPct !== null && (
                              <span className={`ml-1 text-xs font-medium ${labMinPct >= 80 ? "text-green-600" : "text-amber-600"}`}>
                                ({labMinPct}%)
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.minKcs === Infinity ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className="tabular-nums">
                            <span className="font-semibold text-slate-800">{s.minKcs}</span>
                            <span className="text-slate-400 text-xs ml-1">/ {s.kcsTotal}</span>
                            {kcMinPct !== null && (
                              <span className={`ml-1 text-xs font-medium ${kcMinPct >= 80 ? "text-green-600" : "text-amber-600"}`}>
                                ({kcMinPct}%)
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 italic truncate max-w-[200px]">
                        {s.minTraineeName || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {showAll ? "All Trainees" : "Graduated Trainees"}
              <span className="ml-2 text-slate-400 font-normal text-xs">
                ({displayRows.length} shown)
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sorted by cohort · graduated first · fewest completions at top within group
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search trainee or cohort…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {showAll ? "Show graduates only" : "Show all trainees"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="text-left px-4 py-3 whitespace-nowrap">Cohort Code</th>
                <th className="text-left px-4 py-3">Cohort Name</th>
                <th className="text-left px-4 py-3">Trainee Name</th>
                <th className="text-right px-4 py-3">Labs</th>
                <th className="text-right px-4 py-3">KCs</th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayRows.map((r) => (
                <tr key={r.traineeId} className={`transition-colors ${r.graduated ? "hover:bg-green-50/40" : "hover:bg-slate-50"}`}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.cohortCode}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{r.cohortName}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{r.traineeName}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    <PctBadge done={r.labsDone} total={r.labsTotal} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <PctBadge done={r.kcsDone} total={r.kcsTotal} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.graduated ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Graduated
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not graduated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayRows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">
              {search ? "No results match your search." : "No data available."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, highlight = false }: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? "text-green-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
