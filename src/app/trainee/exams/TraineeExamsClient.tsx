"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { submitMyExamResult, deleteMyExamResult } from "@/actions/exams";
import { AWS_PASSING_SCORES } from "@/lib/exam-constants";
import { upsertExamSchedule } from "@/actions/exam-schedules";

type Quiz = { id: string; quiz_name: string; focus_type: string; focus_label: string | null; week_number: number; quiz_date: string | null; max_score: number };
type Outcome = { id: string; exam_type: string; actual_score: number | null; outcome: string; exam_date: string | null; attempt_no: number; notes: string | null; self_reported: boolean };
type ExamSchedule = {
  id: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  personal_email: string;
  cohort_display_name: string;
  region: string;
  aws_account_id: string | null;
  aws_cert_email: string | null;
  canvas_grad_status: string;
  batch_number: number | null;
  voucher_issued: boolean;
  submitted_at: string;
};

const GHANA_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern",
  "Greater Accra", "North East", "Northern", "Oti", "Savannah",
  "Upper East", "Upper West", "Volta", "Western", "Western North",
];

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
  traineeId, cohortId, cohortName, cohortLevel, showReadiness, graduated,
  personalEmail, defaultFirstName, defaultLastName,
  quizzes, myBestMap, myRankMap, avgPct, quizCount, outcomes, existingSchedule,
}: {
  traineeId:         string;
  cohortId:          string;
  cohortName:        string | null;
  cohortLevel:       string;
  showReadiness:     boolean;
  graduated:         boolean;
  personalEmail:     string;
  defaultFirstName:  string;
  defaultLastName:   string;
  quizzes:           Quiz[];
  myBestMap:         Record<string, number>;
  myRankMap:         Record<string, { rank: number; total: number }>;
  avgPct:            number | null;
  quizCount:         number;
  outcomes:          Outcome[];
  existingSchedule:  ExamSchedule | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const banner = eligibilityBanner(avgPct, quizCount);
  const availableExamTypes = EXAM_TYPES_BY_LEVEL[cohortLevel] ?? ["CCP", "SAA-C03", "DVA-C02"];

  const [showReportForm,  setShowReportForm]  = useState(false);
  const [reportError,     setReportError]     = useState("");
  const [reportExamType,  setReportExamType]  = useState(availableExamTypes[0] ?? "CCP");
  const [reportScore,     setReportScore]     = useState("");
  const [showSchedForm,   setShowSchedForm]   = useState(false);
  const [schedError,      setSchedError]      = useState("");

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

  function handleSubmitSchedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("trainee_id", traineeId);
    fd.set("cohort_id",  cohortId);
    fd.set("cohort_display_name", cohortName ?? "");
    fd.set("personal_email", personalEmail);
    fd.set("canvas_grad_status", "Graduated");
    setSchedError("");
    startTransition(async () => {
      const res = await upsertExamSchedule(fd);
      if (res.error) { setSchedError(res.error); toast(res.error, "error"); return; }
      toast(existingSchedule ? "Registration updated" : "Exam registration submitted!");
      setShowSchedForm(false);
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

      {/* Exam Scheduling — only for graduated trainees */}
      {graduated && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Exam Registration</h2>
              <p className="text-xs text-slate-400 mt-0.5">Submit your details to register for your certification exam.</p>
            </div>
            {!showSchedForm && (
              <button
                onClick={() => setShowSchedForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                {existingSchedule ? "Edit Registration" : "Register for Exam"}
              </button>
            )}
          </div>

          {/* Existing registration summary */}
          {existingSchedule && !showSchedForm && (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {existingSchedule.voucher_issued ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Voucher Issued
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                    Pending voucher
                  </span>
                )}
                {existingSchedule.batch_number && (
                  <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    Batch #{existingSchedule.batch_number}
                  </span>
                )}
                <span className="text-xs text-slate-400">Submitted {fmtDate(existingSchedule.submitted_at)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                <div><span className="text-slate-400">Name: </span>{existingSchedule.first_name} {existingSchedule.last_name}{existingSchedule.other_names ? ` ${existingSchedule.other_names}` : ""}</div>
                <div><span className="text-slate-400">Region: </span>{existingSchedule.region}</div>
                <div><span className="text-slate-400">Email: </span>{existingSchedule.personal_email}</div>
                <div><span className="text-slate-400">Cohort: </span>{existingSchedule.cohort_display_name}</div>
                {existingSchedule.aws_account_id && <div><span className="text-slate-400">AWS Account: </span>{existingSchedule.aws_account_id}</div>}
                {existingSchedule.aws_cert_email && <div><span className="text-slate-400">AWS Cert Email: </span>{existingSchedule.aws_cert_email}</div>}
              </div>
            </div>
          )}

          {!existingSchedule && !showSchedForm && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-slate-400">You have not registered for an exam yet.</p>
            </div>
          )}

          {/* Registration form */}
          {showSchedForm && (
            <div className="px-5 py-4 bg-orange-50 border-t border-orange-100">
              <form onSubmit={handleSubmitSchedule} className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-700">Exam Registration Details</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">First Name *</label>
                    <input name="first_name" type="text" required defaultValue={existingSchedule?.first_name ?? defaultFirstName}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Last Name *</label>
                    <input name="last_name" type="text" required defaultValue={existingSchedule?.last_name ?? defaultLastName}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Other Names</label>
                    <input name="other_names" type="text" defaultValue={existingSchedule?.other_names ?? ""}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Personal Email</label>
                    <input type="text" value={personalEmail} readOnly
                      className="w-full border border-slate-100 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Cohort</label>
                    <input type="text" value={cohortName ?? ""} readOnly
                      className="w-full border border-slate-100 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Region *</label>
                    <select name="region" required defaultValue={existingSchedule?.region ?? ""}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                      <option value="">Select region…</option>
                      {GHANA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">AWS Account ID</label>
                    <input name="aws_account_id" type="text" defaultValue={existingSchedule?.aws_account_id ?? ""}
                      placeholder="e.g. 123456789012"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">AWS Certification Email</label>
                    <input name="aws_cert_email" type="email" defaultValue={existingSchedule?.aws_cert_email ?? ""}
                      placeholder="email used for AWS certifications"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Canvas Graduation Status</label>
                    <input type="text" value="Graduated" readOnly
                      className="w-full border border-slate-100 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
                  </div>
                </div>

                {schedError && <p className="text-xs text-red-600">{schedError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={isPending}
                    className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                    {isPending ? "Submitting…" : existingSchedule ? "Update Registration" : "Submit Registration"}
                  </button>
                  <button type="button" onClick={() => { setShowSchedForm(false); setSchedError(""); }}
                    className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

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
                  <select
                    name="examType"
                    required
                    value={reportExamType}
                    onChange={(e) => { setReportExamType(e.target.value); setReportScore(""); }}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    {availableExamTypes.map((et) => <option key={et} value={et}>{et}</option>)}
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
                    value={reportScore}
                    onChange={(e) => setReportScore(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  {/* Live pass/fail preview */}
                  {(() => {
                    const n = parseInt(reportScore, 10);
                    const threshold = AWS_PASSING_SCORES[reportExamType] ?? 700;
                    if (!reportScore || isNaN(n)) {
                      return (
                        <div className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 bg-white h-[34px] flex items-center">
                          Result auto-calculated
                        </div>
                      );
                    }
                    const passed = n >= threshold;
                    return (
                      <div className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold flex items-center gap-2 ${passed ? "bg-green-100 text-green-700 border border-green-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                        {passed ? "✓ Pass" : "✗ Fail"}
                        <span className="font-normal text-xs opacity-70">(min {threshold})</span>
                      </div>
                    );
                  })()}
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
                <button type="button" onClick={() => { setShowReportForm(false); setReportError(""); setReportScore(""); }}
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
