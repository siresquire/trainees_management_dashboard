"use client";

import { Fragment, useMemo, useState, useRef, useEffect } from "react";
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

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  if (dir === "asc")
    return (
      <svg className="w-3 h-3 text-orange-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 9 L8 3 L12 9 Z" />
      </svg>
    );
  if (dir === "desc")
    return (
      <svg className="w-3 h-3 text-orange-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 7 L12 7 L8 13 Z" />
      </svg>
    );
  return (
    <svg className="w-3 h-3 text-slate-300 shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 7 L8 2 L12 7 Z M4 9 L12 9 L8 14 Z" />
    </svg>
  );
}

export default function GraduationThresholdsClient({ rows }: { rows: GradRow[] }) {
  // ── Cohort filter ─────────────────────────────────────────────────────────────
  const allCohortOptions = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const r of rows) {
      if (!map.has(r.cohortId))
        map.set(r.cohortId, { id: r.cohortId, code: r.cohortCode, name: r.cohortName });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const [selectedCohortIds, setSelectedCohortIds] = useState<Set<string>>(
    () => new Set(rows.map((r) => r.cohortId)),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [filterOpen]);

  // ── Summary table expand ──────────────────────────────────────────────────────
  const [expandedCohorts, setExpandedCohorts] = useState<Set<string>>(new Set());

  // ── Detail table sort ─────────────────────────────────────────────────────────
  const [gradSortKey, setGradSortKey] = useState<"lab" | "kc" | null>(null);
  const [gradSortDir, setGradSortDir] = useState<"asc" | "desc">("desc");

  // ── Detail table display filters ──────────────────────────────────────────────
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  // ── Derived data ──────────────────────────────────────────────────────────────

  // Rows filtered by cohort selection → drives scorecards and summary table.
  // Empty selection (after "Clear") is treated as "no filter" so the page
  // doesn't go blank — user can then check individual cohorts to narrow down.
  const filteredRows = useMemo(
    () =>
      selectedCohortIds.size === 0 || selectedCohortIds.size === allCohortOptions.length
        ? rows
        : rows.filter((r) => selectedCohortIds.has(r.cohortId)),
    [rows, selectedCohortIds, allCohortOptions.length],
  );

  // Per-cohort summary recomputed from filteredRows
  const cohortSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        cohortId:       string;
        cohortCode:     string;
        cohortName:     string;
        total:          number;
        graduated:      number;
        labsTotal:      number;
        kcsTotal:       number;
        minTraineeName: string;
        minLabs:        number;
        minKcs:         number;
      }
    >();
    for (const r of filteredRows) {
      if (!map.has(r.cohortId)) {
        map.set(r.cohortId, {
          cohortId:       r.cohortId,
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
        if (r.labsDone + r.kcsDone < e.minLabs + e.minKcs) {
          e.minLabs        = r.labsDone;
          e.minKcs         = r.kcsDone;
          e.minTraineeName = r.traineeName;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.cohortName.localeCompare(b.cohortName));
  }, [filteredRows]);

  const totalGraduated = useMemo(
    () => filteredRows.filter((r) => r.graduated).length,
    [filteredRows],
  );

  // Graduated trainees grouped by cohort for expandable rows
  const graduatedByCohort = useMemo(() => {
    const map = new Map<string, GradRow[]>();
    for (const r of filteredRows) {
      if (r.graduated) {
        const arr = map.get(r.cohortId) ?? [];
        arr.push(r);
        map.set(r.cohortId, arr);
      }
    }
    return map;
  }, [filteredRows]);

  // Display rows: cohort filter + search + showAll (not affected by sort)
  const displayRows = useMemo(() => {
    let base = filteredRows;
    if (!showAll) base = base.filter((r) => r.graduated);
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(
        (r) =>
          r.traineeName.toLowerCase().includes(q) ||
          r.cohortName.toLowerCase().includes(q) ||
          r.cohortCode.toLowerCase().includes(q),
      );
    }
    return base;
  }, [filteredRows, showAll, search]);

  // Sorted display rows — sort does NOT affect scorecards or summary
  const sortedDisplayRows = useMemo(() => {
    if (!gradSortKey) return displayRows;
    return [...displayRows].sort((a, b) => {
      const va = gradSortKey === "lab" ? a.labsDone : a.kcsDone;
      const vb = gradSortKey === "lab" ? b.labsDone : b.kcsDone;
      return gradSortDir === "asc" ? va - vb : vb - va;
    });
  }, [displayRows, gradSortKey, gradSortDir]);

  // Metrics line for detail table header (computed from displayRows, not affected by sort)
  const gradMetrics = useMemo(() => {
    const grads = displayRows.filter((r) => r.graduated);
    if (!grads.length) return null;
    const n = grads.length;
    return {
      avgLabs:      Math.round(grads.reduce((s, r) => s + r.labsDone, 0) / n),
      avgLabsTotal: Math.round(grads.reduce((s, r) => s + r.labsTotal, 0) / n),
      avgKcs:       Math.round(grads.reduce((s, r) => s + r.kcsDone, 0) / n),
      avgKcsTotal:  Math.round(grads.reduce((s, r) => s + r.kcsTotal, 0) / n),
      minLabs:      Math.min(...grads.map((r) => r.labsDone)),
      minKcs:       Math.min(...grads.map((r) => r.kcsDone)),
    };
  }, [displayRows]);

  // ── Event handlers ────────────────────────────────────────────────────────────

  function toggleSort(key: "lab" | "kc") {
    if (gradSortKey === key) {
      setGradSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setGradSortKey(key);
      setGradSortDir("desc");
    }
  }

  function toggleCohort(id: string) {
    setSelectedCohortIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpandCohort(id: string) {
    setExpandedCohorts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected =
    selectedCohortIds.size === 0 || selectedCohortIds.size === allCohortOptions.length;
  const filterLabel = allSelected
    ? "All cohorts"
    : `${selectedCohortIds.size} of ${allCohortOptions.length} cohorts`;

  // ── Excel export ──────────────────────────────────────────────────────────────
  function handleExport() {
    const allExportRows = filteredRows.map((r) => ({
      "Cohort Code":       r.cohortCode,
      "Cohort Name":       r.cohortName,
      "Trainee Name":      r.traineeName,
      "Labs Done":         r.labsDone,
      "Labs Total":        r.labsTotal,
      "Labs %":            r.labsTotal > 0 ? `${Math.round((r.labsDone / r.labsTotal) * 100)}%` : "—",
      "KCs Done":          r.kcsDone,
      "KCs Total":         r.kcsTotal,
      "KCs %":             r.kcsTotal > 0 ? `${Math.round((r.kcsDone / r.kcsTotal) * 100)}%` : "—",
      "Graduation Status": r.graduated ? "Graduated" : "Not Graduated",
    }));
    const summaryExportRows = cohortSummary.map((s) => ({
      "Cohort Code":          s.cohortCode,
      "Cohort Name":          s.cohortName,
      "Total Trainees":       s.total,
      "Graduated":            s.graduated,
      "Graduation Rate":      `${Math.round((s.graduated / s.total) * 100)}%`,
      "Min Labs (Graduated)": s.minLabs === Infinity ? "—" : s.minLabs,
      "Min KCs (Graduated)":  s.minKcs  === Infinity ? "—" : s.minKcs,
      "Min Trainee Example":  s.minTraineeName || "—",
      "Total Labs Available": s.labsTotal,
      "Total KCs Available":  s.kcsTotal,
      "Min Labs %": s.labsTotal > 0 && s.minLabs !== Infinity
        ? `${Math.round((s.minLabs / s.labsTotal) * 100)}%` : "—",
      "Min KCs %": s.kcsTotal > 0 && s.minKcs !== Infinity
        ? `${Math.round((s.minKcs / s.kcsTotal) * 100)}%` : "—",
    }));
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(allExportRows);
    ws1["!cols"] = [14, 30, 30, 10, 10, 8, 8, 8, 6, 16].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, "All Trainees");
    const ws2 = XLSX.utils.json_to_sheet(summaryExportRows);
    ws2["!cols"] = [14, 30, 14, 12, 14, 18, 16, 30, 20, 20, 10, 10].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, "Cohort Summary");
    XLSX.writeFile(wb, "practitioner_graduation_thresholds.xlsx");
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl">

      {/* Header */}
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

      {/* KPI strip — reflects cohort filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Practitioner Cohorts" value={cohortSummary.length} />
        <KpiCard label="Total Trainees"        value={filteredRows.length} />
        <KpiCard label="Graduated"             value={totalGraduated} highlight />
        <KpiCard
          label="Graduation Rate"
          value={filteredRows.length > 0
            ? `${Math.round((totalGraduated / filteredRows.length) * 100)}%`
            : "—"}
        />
      </div>

      {/* Per-cohort summary — filter button + expandable rows */}
      {cohortSummary.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Minimum graduation thresholds per cohort
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click a row to expand graduated trainees · Floor Canvas accepted per cohort
              </p>
            </div>

            {/* Cohort multi-select filter */}
            <div ref={filterRef} className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                  allSelected
                    ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                    : "border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 2v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {filterLabel}
                <svg
                  className={`w-3 h-3 transition-transform ${filterOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg w-64">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                    <button
                      onClick={() =>
                        setSelectedCohortIds(new Set(allCohortOptions.map((c) => c.id)))
                      }
                      className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelectedCohortIds(new Set())}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                    {allCohortOptions.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCohortIds.has(c.id)}
                          onChange={() => toggleCohort(c.id)}
                          className="mt-0.5 accent-orange-500"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 leading-tight">{c.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{c.code}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="px-3 py-3 w-8" />
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
                  const kcMinPct = s.kcsTotal > 0 && s.minKcs !== Infinity
                    ? Math.round((s.minKcs / s.kcsTotal) * 100) : null;
                  const isExpanded = expandedCohorts.has(s.cohortId);
                  const expandedTrainees = graduatedByCohort.get(s.cohortId) ?? [];
                  return (
                    <Fragment key={s.cohortCode}>
                      <tr
                        onClick={() => toggleExpandCohort(s.cohortId)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-3 text-slate-400 text-center">
                          <svg
                            className={`w-3.5 h-3.5 inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
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

                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="px-0 py-0 bg-green-50/40 border-b border-green-100">
                            {expandedTrainees.length === 0 ? (
                              <p className="px-8 py-3 text-xs text-slate-400 italic">
                                No graduated trainees in this cohort.
                              </p>
                            ) : (
                              <div className="px-8 py-3">
                                <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-2">
                                  {expandedTrainees.length} graduated trainee{expandedTrainees.length !== 1 ? "s" : ""}
                                </p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-green-100 text-[10px] font-medium text-slate-500">
                                      <th className="text-left pb-1.5">Trainee Name</th>
                                      <th className="text-right pb-1.5">Labs</th>
                                      <th className="text-right pb-1.5">KCs</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-green-50">
                                    {[...expandedTrainees]
                                      .sort((a, b) => (a.labsDone + a.kcsDone) - (b.labsDone + b.kcsDone))
                                      .map((t) => (
                                        <tr key={t.traineeId}>
                                          <td className="py-1.5 text-slate-700">{t.traineeName}</td>
                                          <td className="py-1.5 text-right">
                                            <PctBadge done={t.labsDone} total={t.labsTotal} />
                                          </td>
                                          <td className="py-1.5 text-right">
                                            <PctBadge done={t.kcsDone} total={t.kcsTotal} />
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Graduated Trainees detail table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {showAll ? "All Trainees" : "Graduated Trainees"}
              <span className="ml-2 text-slate-400 font-normal text-xs">
                ({sortedDisplayRows.length} shown)
              </span>
            </h2>
            {/* Metrics line — updates with cohort filter and search, not affected by sort */}
            {gradMetrics ? (
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Avg Labs: {gradMetrics.avgLabs}/{gradMetrics.avgLabsTotal}
                {" "}({pct(gradMetrics.avgLabs, gradMetrics.avgLabsTotal)}%)
                <span className="mx-1.5 text-slate-300">·</span>
                Avg KCs: {gradMetrics.avgKcs}/{gradMetrics.avgKcsTotal}
                {" "}({pct(gradMetrics.avgKcs, gradMetrics.avgKcsTotal)}%)
                <span className="mx-1.5 text-slate-300">·</span>
                Min Labs: {gradMetrics.minLabs}
                <span className="mx-1.5 text-slate-300">·</span>
                Min KCs: {gradMetrics.minKcs}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">
                Sorted by cohort · graduated first · fewest completions at top within group
              </p>
            )}
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
                <th className="text-right px-4 py-3">
                  <button
                    onClick={() => toggleSort("lab")}
                    className="inline-flex items-center justify-end gap-1 hover:text-slate-800 transition-colors"
                  >
                    Labs
                    <SortIcon dir={gradSortKey === "lab" ? gradSortDir : null} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button
                    onClick={() => toggleSort("kc")}
                    className="inline-flex items-center justify-end gap-1 hover:text-slate-800 transition-colors"
                  >
                    KCs
                    <SortIcon dir={gradSortKey === "kc" ? gradSortDir : null} />
                  </button>
                </th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedDisplayRows.map((r) => (
                <tr
                  key={r.traineeId}
                  className={`transition-colors ${r.graduated ? "hover:bg-green-50/40" : "hover:bg-slate-50"}`}
                >
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
          {sortedDisplayRows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">
              {search ? "No results match your search." : "No data available."}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}

function KpiCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? "text-green-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
