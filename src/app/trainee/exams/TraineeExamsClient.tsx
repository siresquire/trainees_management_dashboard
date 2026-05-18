"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { submitMyExamResult, deleteMyExamResult } from "@/actions/exams";

// ── Types ─────────────────────────────────────────────────────────────────────

type Quiz = {
  id:          string;
  quiz_name:   string;
  focus_type:  string;
  focus_label: string | null;
  week_number: number;
  quiz_date:   string | null;
  max_score:   number;
};

type Voucher = {
  id:           string;
  exam_type:    string;
  issued_date:  string;
  attempt_no:   number;
  voucher_code: string | null;
};

type Outcome = {
  id:            string;
  exam_type:     string;
  actual_score:  number | null;
  outcome:       string;
  exam_date:     string | null;
  attempt_no:    number;
  notes:         string | null;
  self_reported: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EXAM_TYPES_BY_LEVEL: Record<string, string[]> = {
  practitioner: ["CCP"],
  associate:    ["SAA-C03", "DVA-C02"],
  professional: ["SAP-C02", "DOP-C02"],
};

const FOCUS_DISPLAY: Record<string, string> = {
  practitioner: "Practitioner",
  associate:    "Associate",
  professional: "Professional",
  other:        "Other",
};

const FOCUS_BADGE: Record<string, string> = {
  practitioner: "bg-blue-100 text-blue-700",
  associate:    "bg-purple-100 text-purple-700",
  professional: "bg-orange-100 text-orange-700",
  other:        "bg-slate-100 text-slate-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function eligibilityBanner(avgPct: number | null, quizCount: number) {
  if (avgPct === null) return null;
  const sub = `Average ${avgPct}% across ${quizCount} quiz${quizCount !== 1 ? "zes" : ""}`;
  if (avgPct >= 80) return {
    label:   "Ready for exam",
    sub,
    classes: "bg-green-50 border-green-200 text-green-800",
    dot:     "bg-green-500",
  };
  if (avgPct >= 60) return {
    label:   "Borderline — keep practising",
    sub,
    classes: "bg-amber-50 border-amber-200 text-amber-800",
    dot:     "bg-amber-500",
  };
  return {
    label:   "Not yet — more practice needed",
    sub,
    classes: "bg-red-50 border-red-200 text-red-800",
    dot:     "bg-red-500",
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TraineeExamsClient({
  traineeId,
  cohortName,
  cohortLevel,
  showReadiness,
  quizzes,
  myBestMap,
  myRankMap,
  avgPct,
  quizCount,
  vouchers,
  outcomes,
}: {
  traineeId:     string;
  cohortName:    string | null;
  cohortLevel:   string;
  showReadiness: boolean;
  quizzes:       Quiz[];
  myBestMap:     Record<string, number>;
  myRankMap:     Record<string, { rank: number; total: number }>;
  avgPct:        number | null;
  quizCount:     number;
  vouchers:      Voucher[];
  outcomes:      Outcome[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const banner = eligibilityBanner(avgPct, quizCount);

  // Exam types available for this level
  const availableExamTypes = EXAM_TYPES_BY_LEVEL[cohortLevel] ?? ["CCP", "SAA-C03", "DVA-C02", "SAP-C02", "DOP-C02"];

  // Self-report form state
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportError,    setReportError]    = useState("");

  // Next attempt number for self-report
  const nextAttemptNo = outcomes.length
    ? Math.max(...outcomes.map((o) => o.attempt_no)) + 1
    : 1;

  function handleSubmitResult(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setReportError("");
    startTransition(async () => {
      const res = await submitMyExamResult(fd);
      if (res.error) { setReportError(res.error); toast(res.error, "error"); return; }
      toast("Exam result submitted");
      setShowReportForm(false);
      router.refresh();
    });
  }

  function handleDeleteResult(outcomeId: string) {
    if (!confirm("Remove this self-reported result?")) return;
    startTransition(async () => {
      const res = await deleteMyExamResult(outcomeId);
      if (res.error) { toast(res.error, "error"); return; }
      toast("Result removed");
      router.refresh();
    });
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Exams</h1>
        {cohortName && (
          <p className="text-sm text-slate-500 mt-0.5">{cohortName}</p>
        )}
      </div>

      {/* Eligibility banner — only shown when trainer has toggled it on */}
      {showReadiness ? (
        banner ? (
          <div className={`border rounded-xl px-5 py-4 ${banner.classes}`}>
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${banner.dot}`} />
              <div>
                <p className="text-sm font-semibold">{banner.label}</p>
                <p className="text-xs mt-0.5 opacity-80">{banner.sub}</p>
              </div>
            </div>
          </div>
        ) : quizzes.length > 0 ? (
          <div className="border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-500">
            No quiz scores recorded yet. Your eligibility will appear here once scores are uploaded.
          </div>
        ) : null
      ) : null}

      {/* Quiz results */}
      {quizzes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">Quiz / Test Results</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {quizzes.map((q) => {
              const best = myBestMap[q.id];
              const max  = q.max_score ?? 100;
              const pct  = best !== undefined ? Math.round((best / max) * 100) : null;
              const rank = myRankMap[q.id];
              const focusLabel =
                q.focus_type === "other" && q.focus_label
                  ? q.focus_label
                  : FOCUS_DISPLAY[q.focus_type] ?? q.focus_type;

              return (
                <div key={q.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{q.quiz_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${FOCUS_BADGE[q.focus_type] ?? "bg-slate-100 text-slate-600"}`}>
                        {focusLabel}
                      </span>
                      <span className="text-[10px] text-slate-400">Week {q.week_number}</span>
                      {q.quiz_date && (
                        <span className="text-[10px] text-slate-400">
                          · {fmtShortDate(q.quiz_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {pct !== null ? (
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${
                        pct >= 80 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {best}
                        <span className="text-slate-400 font-normal text-xs"> / {max}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">{pct}%</p>
                      {rank && (
                        <p className="text-[10px] text-slate-400">
                          Rank {rank.rank} of {rank.total}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300 flex-shrink-0">Not yet scored</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No quizzes state */}
      {!quizzes.length && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm text-slate-400">No quizzes have been assigned to your cohort yet.</p>
        </div>
      )}

      {/* Voucher status */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">Exam Voucher</h2>
        </div>
        <div className="px-5 py-4">
          {vouchers.length > 0 ? (
            <div className="space-y-4">
              {vouchers.map((v) => (
                <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Voucher Issued — {v.exam_type}
                    </span>
                    <span className="text-xs text-slate-400">Attempt #{v.attempt_no} · {fmtDate(v.issued_date)}</span>
                  </div>
                  {v.voucher_code ? (
                    <div className="mt-1">
                      <p className="text-xs text-slate-500 mb-1">Your voucher code:</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-base font-mono font-bold tracking-widest text-slate-900 bg-white border-2 border-slate-300 px-4 py-2 rounded-lg select-all">
                          {v.voucher_code}
                        </code>
                        <p className="text-xs text-slate-400">Use this code when booking your exam on Pearson VUE.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">Voucher code not yet assigned — contact your trainer.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No voucher issued yet.</p>
          )}
        </div>
      </div>

      {/* Official exam results */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Official Exam Results</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Self-reported results are reviewed and may be updated by your trainer.
            </p>
          </div>
          <button
            onClick={() => { setShowReportForm((v) => !v); setReportError(""); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Record Result
          </button>
        </div>

        {/* Self-report form */}
        {showReportForm && (
          <div className="px-5 py-4 border-b border-slate-100 bg-orange-50">
            <form onSubmit={handleSubmitResult} className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-700">Report Your Exam Result</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Exam *</label>
                  <select
                    name="examType"
                    required
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    {availableExamTypes.map((et) => (
                      <option key={et} value={et}>{et}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Score *</label>
                  <input
                    name="score"
                    type="number"
                    min="100"
                    max="1000"
                    placeholder="e.g. 750"
                    required
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Result *</label>
                  <select
                    name="passed"
                    required
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="passed">Pass</option>
                    <option value="failed">Fail</option>
                    <option value="pending">Awaiting result</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Exam Date *</label>
                  <input
                    name="examDate"
                    type="date"
                    required
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Attempt #</label>
                  <input
                    name="attemptNo"
                    type="number"
                    min="1"
                    defaultValue={nextAttemptNo}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <input
                    name="notes"
                    type="text"
                    placeholder="Optional"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>
              {reportError && (
                <p className="text-xs text-red-600">{reportError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isPending ? "Submitting…" : "Submit"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReportForm(false); setReportError(""); }}
                  className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="px-5 py-4">
          {outcomes.length > 0 ? (
            <div className="space-y-3">
              {outcomes.map((o) => (
                <div key={o.id} className="flex items-start gap-3 flex-wrap">
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    o.outcome === "passed" ? "bg-green-100 text-green-700"
                    : o.outcome === "failed" ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                  }`}>
                    {o.outcome === "passed" ? "✓ PASSED" : o.outcome === "failed" ? "✗ FAILED" : "⏳ Pending"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-700">
                      {o.exam_type} · Score:{" "}
                      <span className="font-semibold tabular-nums">{o.actual_score ?? "—"}</span>
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">Attempt #{o.attempt_no}</span>
                      {o.exam_date && (
                        <span className="text-xs text-slate-400">{fmtDate(o.exam_date)}</span>
                      )}
                      {o.notes && (
                        <span className="text-xs text-slate-500 italic">{o.notes}</span>
                      )}
                      {o.self_reported && (
                        <span className="inline-flex items-center text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                          Self-reported · pending trainer review
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Only allow deletion of own self-reported records */}
                  {o.self_reported && (
                    <button
                      onClick={() => handleDeleteResult(o.id)}
                      disabled={isPending}
                      title="Remove this self-reported result"
                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0 text-xs mt-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No official exam results recorded yet.</p>
          )}
        </div>
      </div>

    </div>
  );
}
