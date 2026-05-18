"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createQuizAssignment,
  deleteQuizAssignment,
  type AssignmentState,
} from "@/actions/quiz-assignments";
import { toast } from "@/lib/toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bank = { id: string; name: string; level: string | null };

type Assignment = {
  id: string;
  title: string;
  mode: string;
  questions_per_student: number;
  time_limit_mins: number | null;
  attempts_allowed: number;
  randomise: boolean;
  show_results: boolean;
  show_answers: boolean;
  open_at: string | null;
  close_at: string | null;
  week_number: number | null;
  created_at: string;
  created_by: string;
  question_banks: { id: string; name: string } | null;
};

type AttemptStat = { assignment_id: string; count: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function statusBadge(a: Assignment) {
  const now = new Date();
  if (a.close_at && new Date(a.close_at) < now)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Closed</span>;
  if (a.open_at && new Date(a.open_at) > now)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Scheduled</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Open</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function QuizzesClient({
  cohortId,
  assignments,
  attemptStats,
  traineeCount,
  banks,
  userId,
}: {
  cohortId: string;
  assignments: Assignment[];
  attemptStats: AttemptStat[];
  traineeCount: number;
  banks: Bank[];
  userId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm]     = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [, startTransition]          = useTransition();

  const [state, formAction, pending] = useActionState<AssignmentState, FormData>(
    createQuizAssignment,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      toast("Quiz assigned successfully.");
      setShowForm(false);
      router.refresh();
    }
    if (state?.error) toast(state.error, "error");
  }, [state, router]);

  const statsMap = new Map(attemptStats.map((s) => [s.assignment_id, s.count]));

  async function handleDelete(assignmentId: string) {
    if (!confirm("Delete this quiz assignment? All attempts and scores will be lost.")) return;
    setDeleting(assignmentId);
    startTransition(async () => {
      const res = await deleteQuizAssignment(assignmentId, cohortId);
      setDeleting(null);
      if (res.error) toast(res.error, "error");
      else { toast("Assignment deleted."); router.refresh(); }
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Quiz Assignments</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Assign quizzes from your question banks to this cohort.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Assign Quiz
        </button>
      </div>

      {/* Assignment form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Assign Quiz to Cohort</h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form action={formAction} className="px-6 py-5 space-y-4">
              <input type="hidden" name="cohort_id" value={cohortId} />

              {/* Question bank */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Question Bank <span className="text-red-500">*</span>
                </label>
                {banks.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">
                    No question banks available. Create one from the Question Banks section.
                  </p>
                ) : (
                  <select name="bank_id" required className={inputCls}>
                    <option value="">Select a question bank…</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}{b.level ? ` (${b.level})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {state?.errors?.bank_id && (
                  <p className="text-xs text-red-500 mt-1">{state.errors.bank_id[0]}</p>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Quiz Title <span className="text-red-500">*</span>
                </label>
                <input type="text" name="title" required maxLength={200} className={inputCls}
                  placeholder="e.g. Week 3 AWS Quiz" />
                {state?.errors?.title && (
                  <p className="text-xs text-red-500 mt-1">{state.errors.title[0]}</p>
                )}
              </div>

              {/* Mode + Questions per student */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
                  <select name="mode" className={inputCls} defaultValue="practice">
                    <option value="practice">Practice</option>
                    <option value="exam">Exam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Questions per student
                  </label>
                  <input type="number" name="questions_per_student" min={1} max={500}
                    defaultValue={10} className={inputCls} />
                </div>
              </div>

              {/* Time limit + Attempts */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Time limit (mins)
                  </label>
                  <input type="number" name="time_limit_mins" min={1}
                    placeholder="No limit" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Attempts allowed
                  </label>
                  <input type="number" name="attempts_allowed" min={1} max={10}
                    defaultValue={1} className={inputCls} />
                </div>
              </div>

              {/* Open / Close dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Opens at
                  </label>
                  <input type="datetime-local" name="open_at" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Closes at
                  </label>
                  <input type="datetime-local" name="close_at" className={inputCls} />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="hidden" name="randomise" value="0" />
                  <input type="checkbox" name="randomise" value="1"
                    defaultChecked className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm text-slate-700">Randomise question order</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="hidden" name="show_results" value="0" />
                  <input type="checkbox" name="show_results" value="1"
                    defaultChecked className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm text-slate-700">Show score immediately after submission</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="hidden" name="show_answers" value="0" />
                  <input type="checkbox" name="show_answers" value="1"
                    className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm text-slate-700">Show correct answers after submission</span>
                </label>
              </div>

              {state?.error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {state.error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-300 text-slate-700 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || banks.length === 0}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {pending ? "Assigning…" : "Assign Quiz"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignments list */}
      {assignments.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 font-medium">No quizzes assigned yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Assign a quiz from a question bank to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const submits = statsMap.get(a.id) ?? 0;
            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                    {statusBadge(a)}
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                      a.mode === "exam"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>{a.mode}</span>
                  </div>

                  <p className="text-xs text-slate-500 truncate mb-2">
                    Bank: <span className="text-slate-700">{a.question_banks?.name ?? "—"}</span>
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{a.questions_per_student} question{a.questions_per_student !== 1 ? "s" : ""}</span>
                    <span>{a.time_limit_mins ? `${a.time_limit_mins} min` : "No time limit"}</span>
                    <span>{a.attempts_allowed} attempt{a.attempts_allowed !== 1 ? "s" : ""}</span>
                    <span className="text-slate-400">
                      Opens {fmtDate(a.open_at)} → Closes {fmtDate(a.close_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:ml-4 shrink-0">
                  <div className="text-center min-w-[3rem]">
                    <p className="text-lg font-bold text-slate-900">{submits}</p>
                    <p className="text-xs text-slate-400">/ {traineeCount}</p>
                  </div>

                  <Link
                    href={`/trainer/cohorts/${cohortId}/quizzes/${a.id}/results`}
                    className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title="View results"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </Link>

                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deleting === a.id}
                    title="Delete assignment"
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
