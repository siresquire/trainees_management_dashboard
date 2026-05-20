"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { submitMyExamResult, deleteMyExamResult } from "@/actions/exams";
import { submitExamAppointment } from "@/actions/exam-appointments";

type Quiz = { id: string; quiz_name: string; focus_type: string; focus_label: string | null; week_number: number; quiz_date: string | null; max_score: number };
type Voucher = { id: string; exam_type: string; issued_date: string; attempt_no: number; voucher_code: string | null; deadline: string | null; appointment_submitted: boolean };
type Outcome = { id: string; exam_type: string; actual_score: number | null; outcome: string; exam_date: string | null; attempt_no: number; notes: string | null; self_reported: boolean };

const EXAM_TYPES_BY_LEVEL: Record<string, string[]> = {
  practitioner: ["CCP"],
  associate:    ["SAA-C03", "DVA-C02"],
  professional: ["SAP-C02", "DOP-C02"],
};

const FOCUS_DISPLAY: Record<string, string> = { practitioner: "Practitioner", associate: "Associate", professional: "Professional", other: "Other" };
const FOCUS_BADGE:   Record<string, string> = { practitioner: "bg-blue-100 text-blue-700", associate: "bg-purple-100 text-purple-700", professional: "bg-orange-100 text-orange-700", other: "bg-slate-100 text-slate-600" };

function eligibilityBanner(avgPct: number | null, quizCount: number) {
  if (avgPct === null) return null;
  const sub = `Average ${avgPct}% across ${quizCount} quiz${quizCount !== 1 ? "zes" : ""}`;
  if (avgPct >= 80) return { label: "Ready for exam", sub, classes: "bg-green-50 border-green-200 text-green-800", dot: "bg-green-500" };
  if (avgPct >= 60) return { label: "Borderline — keep practising", sub, classes: "bg-amber-50 border-amber-200 text-amber-800", dot: "bg-amber-500" };
  return { label: "Not yet — more practice needed", sub, classes: "bg-red-50 border-red-200 text-red-800", dot: "bg-red-500" };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function TraineeExamsClient({
  traineeId, cohortId, cohortName, cohortLevel, showReadiness,
  quizzes, myBestMap, myRankMap, avgPct, quizCount, vouchers, outcomes,
}: {
  traineeId:     string;
  cohortId:      string;
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
  const availableExamTypes = EXAM_TYPES_BY_LEVEL[cohortLevel] ?? ["CCP", "SAA-C03", "DVA-C02"];

  const [showReportForm,    setShowReportForm]    = useState(false);
  const [reportError,       setReportError]       = useState("");
  const [appointmentVoucher, setAppointmentVoucher] = useState<Voucher | null>(null);
  const [apptError,         setApptError]         = useState("");

  const nextAttemptNo = outcomes.length ? Math.max(...outcomes.map((o) => o.attempt_no)) + 1 : 1;

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

  function handleSubmitAppointment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("trainee_id", traineeId);
    fd.set("cohort_id",  cohortId);
    fd.set("voucher_id", appointmentVoucher?.id ?? "");
    setApptError("");
    startTransition(async () => {
      const res = await submitExamAppointment(fd);
      if (res.error) { setApptError(res.error); toast(res.error, "error"); return; }
      toast("Exam appointment submitted — your voucher code is now visible!");
      setAppointmentVoucher(null);
      router.refresh();
    });
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Exams</h1>
        {cohortName && <p className="text-sm text-slate-500 mt-0.5">{cohortName}</p>}
      </div>

      {/* Eligibility banner */}
      {showReadiness && banner && (
        <div className={`border rounded-xl px-5 py-4 ${banner.classes}`}>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${banner.dot}`} />
            <div>
              <p className="text-sm font-semibold">{banner.label}</p>
              <p className="text-xs mt-0.5 opacity-80">{banner.sub}</p>
            </div>
          </div>
        </div>
      )}

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
              const p    = best !== undefined ? Math.round((best / max) * 100) : null;
              const rank = myRankMap[q.id];
              const focusLabel = q.focus_type === "other" && q.focus_label ? q.focus_label : FOCUS_DISPLAY[q.focus_type] ?? q.focus_type;
              return (
                <div key={q.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{q.quiz_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${FOCUS_BADGE[q.focus_type] ?? "bg-slate-100 text-slate-600"}`}>{focusLabel}</span>
                      <span className="text-[10px] text-slate-400">Week {q.week_number}</span>
                      {q.quiz_date && <span className="text-[10px] text-slate-400">· {fmtShortDate(q.quiz_date)}</span>}
                    </div>
                  </div>
                  {p !== null
                    ? <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-semibold tabular-nums ${p >= 80 ? "text-green-600" : p >= 60 ? "text-amber-600" : "text-red-600"}`}>
                          {best}<span className="text-slate-400 font-normal text-xs"> / {max}</span>
                        </p>
                        <p className="text-[10px] text-slate-500">{p}%</p>
                        {rank && <p className="text-[10px] text-slate-400">Rank {rank.rank} of {rank.total}</p>}
                      </div>
                    : <span className="text-xs text-slate-300 flex-shrink-0">Not yet scored</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      Voucher Issued — {v.exam_type}
                    </span>
                    <span className="text-xs text-slate-400">Attempt #{v.attempt_no} · {fmtDate(v.issued_date)}</span>
                    {v.deadline && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${new Date(v.deadline) < new Date() ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                        Deadline: {fmtDate(v.deadline)}
                      </span>
                    )}
                  </div>

                  {v.voucher_code ? (
                    v.appointment_submitted ? (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Your voucher code:</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-base font-mono font-bold tracking-widest text-slate-900 bg-white border-2 border-slate-300 px-4 py-2 rounded-lg select-all">
                            {v.voucher_code}
                          </code>
                          <p className="text-xs text-slate-400">Use this code when booking your exam on Pearson VUE.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">
                          Your voucher code is ready but <strong>hidden</strong> until you submit your exam appointment details below.
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="text-base font-mono font-bold tracking-widest text-slate-400 bg-slate-100 border-2 border-slate-200 px-4 py-2 rounded-lg select-none">
                            ••••••••••••
                          </code>
                        </div>
                        {appointmentVoucher?.id !== v.id ? (
                          <button
                            onClick={() => setAppointmentVoucher(v)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            Submit exam appointment to reveal code
                          </button>
                        ) : (
                          <form onSubmit={handleSubmitAppointment} className="mt-3 space-y-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-slate-700">When and where are you sitting your exam?</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Exam date *</label>
                                <input name="exam_date" type="date" required
                                  max={appointmentVoucher?.deadline?.slice(0, 10) ?? undefined}
                                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                                {appointmentVoucher?.deadline && (
                                  <p className="text-[10px] text-amber-600 mt-0.5">Must be on or before {fmtDate(appointmentVoucher.deadline)}</p>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Exam time *</label>
                                <input name="exam_time" type="time" required
                                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Location / centre *</label>
                                <input name="exam_location" type="text" required placeholder="e.g. Accra Pearson VUE"
                                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                              </div>
                            </div>
                            {apptError && <p className="text-xs text-red-600">{apptError}</p>}
                            <div className="flex gap-2">
                              <button type="submit" disabled={isPending}
                                className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                                {isPending ? "Submitting…" : "Submit & reveal code"}
                              </button>
                              <button type="button" onClick={() => setAppointmentVoucher(null)}
                                className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )
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
            <p className="text-xs text-slate-400 mt-0.5">Self-reported results are reviewed and may be updated by your trainer.</p>
          </div>
          <button onClick={() => { setShowReportForm((v) => !v); setReportError(""); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg flex-shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            Record Result
          </button>
        </div>

        {showReportForm && (
          <div className="px-5 py-4 border-b border-slate-100 bg-orange-50">
            <form onSubmit={handleSubmitResult} className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-700">Report Your Exam Result</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Exam *</label>
                  <select name="examType" required className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                    {availableExamTypes.map((et) => <option key={et} value={et}>{et}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Score *</label>
                  <input name="score" type="number" min="100" max="1000" placeholder="e.g. 750" required
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Result *</label>
                  <select name="passed" required className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="passed">Pass</option>
                    <option value="failed">Fail</option>
                    <option value="pending">Awaiting result</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Exam Date *</label>
                  <input name="examDate" type="date" required
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Attempt #</label>
                  <input name="attemptNo" type="number" min="1" defaultValue={nextAttemptNo}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <input name="notes" type="text" placeholder="Optional"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
              </div>
              {reportError && <p className="text-xs text-red-600">{reportError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={isPending}
                  className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {isPending ? "Submitting…" : "Submit"}
                </button>
                <button type="button" onClick={() => { setShowReportForm(false); setReportError(""); }}
                  className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">
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
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${o.outcome === "passed" ? "bg-green-100 text-green-700" : o.outcome === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    {o.outcome === "passed" ? "✓ PASSED" : o.outcome === "failed" ? "✗ FAILED" : "⏳ Pending"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-700">
                      {o.exam_type} · Score: <span className="font-semibold tabular-nums">{o.actual_score ?? "—"}</span>
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">Attempt #{o.attempt_no}</span>
                      {o.exam_date && <span className="text-xs text-slate-400">{fmtDate(o.exam_date)}</span>}
                      {o.notes && <span className="text-xs text-slate-500 italic">{o.notes}</span>}
                      {o.self_reported && (
                        <span className="inline-flex items-center text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                          Self-reported · pending trainer review
                        </span>
                      )}
                    </div>
                  </div>
                  {o.self_reported && (
                    <button onClick={() => handleDeleteResult(o.id)} disabled={isPending} title="Remove this result"
                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0 text-xs mt-1">✕</button>
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
