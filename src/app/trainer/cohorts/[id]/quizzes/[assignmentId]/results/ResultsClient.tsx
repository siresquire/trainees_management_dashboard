"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishQuizToExams } from "@/actions/quiz-assignments";
import { toast } from "@/lib/toast";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trainee = { id: string; full_name: string; personal_email: string; serial_no: number | null };

type Attempt = {
  id: string;
  attempt_no: number;
  submitted_at: string | null;
  auto_score: number | null;
  manual_score: number | null;
  final_score: number | null;
  started_at: string;
  trainees: Trainee | null;
};

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  option_f: string | null;
  correct_answers: string[] | null;
  points: number;
  explanation: string | null;
};

type Answer = {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_options: string[] | null;
  text_answer: string | null;
  is_correct: boolean | null;
  score_awarded: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
function optionText(q: Question, l: string) {
  const m: Record<string, string | null> = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d, E: q.option_e, F: q.option_f };
  return m[l] ?? null;
}

function pct(score: number | null, max: number) {
  if (score == null || max === 0) return null;
  return Math.round((score / max) * 100);
}

function ScoreBadge({ score, max }: { score: number | null; max: number }) {
  const p = pct(score, max);
  if (p == null) return <span className="text-xs text-slate-400">—</span>;
  const color = p >= 70 ? "bg-emerald-100 text-emerald-700" : p >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {p}% ({score?.toFixed(1)}/{max})
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ResultsClient({
  cohortId,
  assignment,
  attempts,
  questions,
  answers,
  maxPoints,
  traineeCount,
}: {
  cohortId: string;
  assignment: {
    id: string;
    title: string;
    mode: string;
    show_answers: boolean;
    published_exam_quiz_id: string | null;
    bank_name: string;
  };
  attempts: Attempt[];
  questions: Question[];
  answers: Answer[];
  maxPoints: number;
  traineeCount: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();

  // Group answers by attempt
  const answersByAttempt = new Map<string, Answer[]>();
  for (const a of answers) {
    const list = answersByAttempt.get(a.attempt_id) ?? [];
    list.push(a);
    answersByAttempt.set(a.attempt_id, list);
  }

  const qMap = new Map(questions.map((q) => [q.id, q]));

  // Summary stats
  const scores = attempts.map((a) => a.final_score ?? 0);
  const avgScore = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
  const passCount = scores.filter((s) => maxPoints > 0 && (s / maxPoints) * 100 >= 70).length;

  function handlePublish() {
    startPublish(async () => {
      const res = await publishQuizToExams(assignment.id, cohortId);
      if (res.error) toast(res.error, "error");
      else {
        toast(assignment.published_exam_quiz_id
          ? "Scores re-published to Exam Dashboard."
          : "Scores published to Exam Dashboard!");
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/trainer/cohorts/${cohortId}/quizzes`}
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quiz Assignments
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium truncate">{assignment.title}</span>
      </div>

      {/* Summary card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900">{assignment.title}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                assignment.mode === "exam" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
              }`}>{assignment.mode}</span>
              {assignment.published_exam_quiz_id && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Published to Exams
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">Bank: {assignment.bank_name}</p>
          </div>

          <button
            onClick={handlePublish}
            disabled={publishing || attempts.length === 0}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {publishing ? "Publishing…" : assignment.published_exam_quiz_id ? "Re-publish to Exams" : "Publish to Exam Dashboard"}
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{attempts.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">/ {traineeCount} submitted</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">
              {avgScore != null ? `${pct(avgScore, maxPoints)}%` : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Average score</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{passCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Passed (≥70%)</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{attempts.length - passCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Below 70%</p>
          </div>
        </div>
      </div>

      {/* Per-trainee table */}
      {attempts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
          <p className="text-slate-500">No submissions yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Individual Results</h2>
            <p className="text-xs text-slate-500 mt-0.5">Click any row to see question-by-question breakdown.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {attempts.map((attempt, idx) => {
              const trainee = attempt.trainees;
              const p = pct(attempt.final_score, maxPoints);
              const isExpanded = expanded === attempt.id;
              const attemptAnswers = answersByAttempt.get(attempt.id) ?? [];
              const answeredQMap = new Map(attemptAnswers.map((a) => [a.question_id, a]));

              return (
                <div key={attempt.id}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : attempt.id)}
                    className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className="text-xs text-slate-400 w-6 text-right shrink-0">
                      {idx + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {trainee?.full_name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{trainee?.personal_email}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <ScoreBadge score={attempt.final_score} max={maxPoints} />

                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        p != null && p >= 70 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      }`}>
                        {p != null ? (p >= 70 ? "P" : "F") : "?"}
                      </div>

                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded: question breakdown */}
                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          Question Breakdown
                        </p>
                        <p className="text-xs text-slate-500">
                          {attempt.submitted_at
                            ? new Date(attempt.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                            : "—"}
                        </p>
                      </div>

                      {questions.map((q, qi) => {
                        const ans = answeredQMap.get(q.id);
                        const isManual = q.question_type === "short_answer" || q.question_type === "code_input";
                        const correct = ans?.is_correct;

                        return (
                          <div key={q.id} className={`bg-white rounded-xl border p-4 ${
                            correct === true ? "border-emerald-200" :
                            correct === false ? "border-red-200" :
                            "border-slate-200"
                          }`}>
                            <div className="flex items-start gap-2 mb-2">
                              <span className={`shrink-0 w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${
                                correct === true ? "bg-emerald-100 text-emerald-700" :
                                correct === false ? "bg-red-100 text-red-600" :
                                "bg-slate-100 text-slate-500"
                              }`}>
                                {qi + 1}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-slate-800 font-medium leading-snug">{q.question_text}</p>
                                <p className="text-xs text-slate-400 mt-0.5 capitalize">
                                  {q.question_type.replace("_", " ")} · {q.points} pt{q.points !== 1 ? "s" : ""}
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                {isManual ? (
                                  <span className="text-xs text-slate-400 italic">Manual</span>
                                ) : correct === true ? (
                                  <span className="text-xs font-semibold text-emerald-600">✓ +{ans?.score_awarded?.toFixed(1)}</span>
                                ) : correct === false ? (
                                  <span className="text-xs font-semibold text-red-500">✗ 0</span>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </div>
                            </div>

                            {/* Answer given */}
                            {!ans ? (
                              <p className="text-xs text-slate-400 italic ml-8">Not answered</p>
                            ) : isManual ? (
                              <div className="ml-8">
                                <p className="text-xs text-slate-500 mb-1">Answer given:</p>
                                <pre className={`text-xs rounded-lg p-2 whitespace-pre-wrap ${
                                  q.question_type === "code_input"
                                    ? "bg-slate-900 text-green-400 font-mono"
                                    : "bg-slate-100 text-slate-700"
                                }`}>
                                  {ans.text_answer || "(empty)"}
                                </pre>
                              </div>
                            ) : (
                              <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {OPTIONS.filter((l) => optionText(q, l) !== null).map((l) => {
                                  const text = optionText(q, l);
                                  const selected = (ans.selected_options ?? []).includes(l);
                                  const isCorrectOpt = (q.correct_answers ?? []).map((s) => s.toUpperCase()).includes(l);
                                  return (
                                    <div key={l} className={`flex items-start gap-1.5 text-xs px-2 py-1 rounded-lg ${
                                      selected && isCorrectOpt ? "bg-emerald-50 text-emerald-700" :
                                      selected && !isCorrectOpt ? "bg-red-50 text-red-600 line-through" :
                                      !selected && isCorrectOpt && assignment.show_answers ? "bg-emerald-50/50 text-emerald-600" :
                                      "text-slate-500"
                                    }`}>
                                      <span className="font-bold shrink-0">{l}.</span>
                                      <span>{text}</span>
                                      {selected && <span className="ml-auto shrink-0">{isCorrectOpt ? "✓" : "✗"}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Explanation */}
                            {assignment.show_answers && q.explanation && (
                              <p className="ml-8 mt-2 text-xs text-slate-500 italic border-t border-slate-100 pt-2">
                                {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
