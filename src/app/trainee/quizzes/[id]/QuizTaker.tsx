"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { startQuizAttempt, submitQuizAttempt, saveQuizAnswer, type QuizQuestion } from "@/actions/quiz-assignments";
import { toast } from "@/lib/toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type Assignment = {
  id: string;
  title: string;
  mode: string;
  time_limit_mins: number | null;
  attempts_allowed: number;
  show_results: boolean;
  show_answers: boolean;
};

// Re-use the shared type from the server action
type Question = QuizQuestion;

type SavedAnswer = {
  question_id: string;
  selected_options: string[] | null;
  text_answer: string | null;
};

type ResultData = {
  score?: number;
  total?: number;
  passed?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;

function optionText(q: Question, letter: string) {
  const map: Record<string, string | null> = {
    A: q.option_a, B: q.option_b, C: q.option_c,
    D: q.option_d, E: q.option_e, F: q.option_f,
  };
  return map[letter] ?? null;
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function QuizTaker({
  assignment,
  traineeId,
  submittedCount,
  inProgressAttemptId,
  questions: serverQuestions,
  savedAnswers,
  isClosed,
  isNotOpen,
}: {
  assignment: Assignment;
  traineeId: string;
  submittedCount: number;
  inProgressAttemptId: string | null;
  questions: Question[];
  savedAnswers: SavedAnswer[];
  isClosed: boolean;
  isNotOpen: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"lobby" | "taking" | "done">(
    inProgressAttemptId ? "taking" : "lobby",
  );
  const [attemptId, setAttemptId] = useState<string | null>(inProgressAttemptId);
  const [questions, setQuestions]   = useState<Question[]>(serverQuestions);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Answers: questionId → {selected: string[], text: string}
  const [answers, setAnswers] = useState<Map<string, { selected: string[]; text: string }>>(
    () => {
      const m = new Map<string, { selected: string[]; text: string }>();
      for (const sa of savedAnswers) {
        m.set(sa.question_id, {
          selected: sa.selected_options ?? [],
          text:     sa.text_answer ?? "",
        });
      }
      return m;
    },
  );

  const [starting,   setStarting]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<ResultData | null>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(
    assignment.time_limit_mins ? assignment.time_limit_mins * 60 : null,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasExhausted = submittedCount >= assignment.attempts_allowed;

  // Start timer when phase = "taking"
  useEffect(() => {
    if (phase !== "taking" || timeLeft === null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null || t <= 1) {
          clearInterval(timerRef.current!);
          handleAutoSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleAutoSubmit = useCallback(async () => {
    if (!attemptId) return;
    await doSubmit(attemptId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function handleStartNew() {
    setStarting(true);
    const res = await startQuizAttempt(assignment.id);
    setStarting(false);
    if (res.error) { toast(res.error, "error"); return; }
    // The action returns questions directly — no refresh needed
    setAttemptId(res.attemptId!);
    setQuestions(res.questions ?? []);
    setPhase("taking");
  }

  function handleOptionChange(questionId: string, letter: string, checked: boolean, multi: boolean) {
    setAnswers((prev) => {
      const m = new Map(prev);
      const cur = m.get(questionId) ?? { selected: [], text: "" };
      let selected: string[];
      if (multi) {
        selected = checked
          ? [...cur.selected, letter]
          : cur.selected.filter((l) => l !== letter);
      } else {
        selected = checked ? [letter] : [];
      }
      m.set(questionId, { ...cur, selected });
      return m;
    });
  }

  function handleTextChange(questionId: string, text: string) {
    setAnswers((prev) => {
      const m = new Map(prev);
      const cur = m.get(questionId) ?? { selected: [], text: "" };
      m.set(questionId, { ...cur, text });
      return m;
    });
  }

  // Autosave current answer when navigating
  async function autosave(qId: string) {
    if (!attemptId) return;
    const ans = answers.get(qId);
    if (!ans) return;
    await saveQuizAnswer(attemptId, qId, ans.selected, ans.text);
  }

  async function goNext() {
    const q = questions[currentIdx];
    if (q) await autosave(q.id);
    setCurrentIdx((i) => Math.min(i + 1, questions.length - 1));
  }

  async function goPrev() {
    const q = questions[currentIdx];
    if (q) await autosave(q.id);
    setCurrentIdx((i) => Math.max(i - 1, 0));
  }

  async function doSubmit(aid: string) {
    setSubmitting(true);
    const answerList = questions.map((q) => {
      const ans = answers.get(q.id) ?? { selected: [], text: "" };
      return {
        question_id:      q.id,
        selected_options: ans.selected.length ? ans.selected : undefined,
        text_answer:      ans.text || undefined,
      };
    });

    const res = await submitQuizAttempt(aid, answerList);
    setSubmitting(false);

    if (res.error) { toast(res.error, "error"); return; }
    if (timerRef.current) clearInterval(timerRef.current);
    setResult({ score: res.score, total: res.total, passed: res.passed });
    setPhase("done");
  }

  async function handleSubmit() {
    if (!attemptId) return;
    if (!confirm("Submit your answers? You cannot change them after submission.")) return;
    await doSubmit(attemptId);
  }

  const q = questions[currentIdx];
  const answeredCount = questions.filter((q) => {
    const ans = answers.get(q.id);
    return ans && (ans.selected.length > 0 || ans.text.trim().length > 0);
  }).length;

  // ── Closed / Not open ───────────────────────────────────────────────────────

  if (isClosed) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto text-center pt-16">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Quiz Closed</h2>
        <p className="text-slate-500">This quiz is no longer accepting submissions.</p>
        <button onClick={() => router.push("/trainee/quizzes")}
          className="mt-6 text-sm font-medium text-orange-600 hover:text-orange-700">
          ← Back to quizzes
        </button>
      </div>
    );
  }

  if (isNotOpen) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto text-center pt-16">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Not Open Yet</h2>
        <p className="text-slate-500">This quiz will open soon. Check back later.</p>
        <button onClick={() => router.push("/trainee/quizzes")}
          className="mt-6 text-sm font-medium text-orange-600 hover:text-orange-700">
          ← Back to quizzes
        </button>
      </div>
    );
  }

  // ── Done / Results ──────────────────────────────────────────────────────────

  if (phase === "done") {
    const pct = result?.total ? Math.round(((result.score ?? 0) / result.total) * 100) : null;
    return (
      <div className="p-6 md:p-8 max-w-xl mx-auto text-center pt-12">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
          result?.passed ? "bg-emerald-100" : "bg-slate-100"
        }`}>
          {result?.passed ? (
            <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-1">
          {assignment.show_results && result?.total != null
            ? result.passed ? "Well done!" : "Quiz submitted"
            : "Quiz submitted!"}
        </h2>

        {assignment.show_results && result?.total != null ? (
          <>
            <p className="text-4xl font-bold my-4 text-slate-900">{pct}%</p>
            <p className="text-slate-500 text-sm mb-6">
              {result.score?.toFixed(1)} / {result.total?.toFixed(1)} points
              {result.passed ? " · Passed" : " · Needs review"}
            </p>
          </>
        ) : (
          <p className="text-slate-500 text-sm mb-6 mt-2">
            Your answers have been recorded. Your trainer will share results.
          </p>
        )}

        <button
          onClick={() => router.push("/trainee/quizzes")}
          className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          Back to Quizzes
        </button>
      </div>
    );
  }

  // ── Lobby ───────────────────────────────────────────────────────────────────

  if (phase === "lobby") {
    return (
      <div className="p-6 md:p-8 max-w-xl mx-auto pt-8">
        <button onClick={() => router.push("/trainee/quizzes")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All quizzes
        </button>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full mb-4 ${
            assignment.mode === "exam" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
          }`}>{assignment.mode}</span>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{assignment.title}</h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-8">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-slate-900 mb-0.5">
                {serverQuestions.length || "—"}
              </p>
              <p className="text-xs text-slate-500">Questions</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-slate-900 mb-0.5">
                {assignment.time_limit_mins ?? "∞"}
              </p>
              <p className="text-xs text-slate-500">Minutes</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-slate-900 mb-0.5">
                {assignment.attempts_allowed}
              </p>
              <p className="text-xs text-slate-500">Attempts</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-slate-900 mb-0.5">
                {submittedCount}
              </p>
              <p className="text-xs text-slate-500">Used</p>
            </div>
          </div>

          {hasExhausted ? (
            <p className="text-sm text-slate-500 bg-slate-100 rounded-lg px-4 py-3 mb-4">
              You have used all {assignment.attempts_allowed} attempt{assignment.attempts_allowed !== 1 ? "s" : ""}.
            </p>
          ) : (
            <button
              onClick={handleStartNew}
              disabled={starting}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-base"
            >
              {starting ? "Starting…" : inProgressAttemptId ? "Resume Quiz" : "Start Quiz"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Taking ───────────────────────────────────────────────────────────────────

  if (!q) {
    return (
      <div className="p-6 text-center text-slate-500">
        Loading questions…
      </div>
    );
  }

  const isMulti = q.question_type === "multi_select";
  const isTF    = q.question_type === "true_false";
  const isText  = q.question_type === "short_answer" || q.question_type === "code_input";
  const curAns  = answers.get(q.id) ?? { selected: [], text: "" };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 z-10">
        <div className="flex-1">
          <p className="text-xs text-slate-500 truncate">{assignment.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm font-semibold text-slate-900">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <span className="text-xs text-slate-400">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
        </div>

        {timeLeft !== null && (
          <div className={`text-sm font-mono font-semibold px-3 py-1 rounded-lg ${
            timeLeft <= 60 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
          }`}>
            ⏱ {fmtTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-200">
        <div
          className="h-1 bg-orange-500 transition-all"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 p-4 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
              {currentIdx + 1}
            </span>
            <div className="flex-1">
              <p className="text-slate-900 font-medium leading-relaxed mb-1">
                {q.question_text}
              </p>
              <p className="text-xs text-slate-400 capitalize">
                {q.question_type.replace("_", " ")} · {q.points} pt{q.points !== 1 ? "s" : ""}
                {isMulti && " · Select all that apply"}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {isTF ? (
              ["True", "False"].map((val) => {
                const letter = val.toUpperCase();
                const checked = curAns.selected.includes(letter);
                return (
                  <label key={val} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    checked ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={checked}
                      onChange={() => handleOptionChange(q.id, letter, true, false)}
                      className="accent-orange-500"
                    />
                    <span className="text-sm text-slate-800">{val}</span>
                  </label>
                );
              })
            ) : isText ? (
              <textarea
                rows={q.question_type === "code_input" ? 8 : 4}
                value={curAns.text}
                onChange={(e) => handleTextChange(q.id, e.target.value)}
                placeholder={q.question_type === "code_input" ? "Write your code here…" : "Write your answer here…"}
                className={`w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none ${
                  q.question_type === "code_input" ? "font-mono bg-slate-900 text-green-400 border-slate-600" : ""
                }`}
              />
            ) : (
              OPTIONS.filter((l) => optionText(q, l) !== null).map((letter) => {
                const text    = optionText(q, letter);
                const checked = curAns.selected.includes(letter);
                return (
                  <label key={letter} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    checked ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                    {isMulti ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleOptionChange(q.id, letter, e.target.checked, true)}
                        className="mt-0.5 accent-orange-500"
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={checked}
                        onChange={() => handleOptionChange(q.id, letter, true, false)}
                        className="mt-0.5 accent-orange-500"
                      />
                    )}
                    <span className="flex items-start gap-2 text-sm text-slate-800">
                      <span className="shrink-0 w-5 h-5 rounded-md bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center mt-0.5">
                        {letter}
                      </span>
                      {text}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={currentIdx === 0}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>

          <div className="flex-1 flex gap-1 flex-wrap justify-center max-w-xs mx-auto">
            {questions.map((qq, i) => {
              const ans = answers.get(qq.id);
              const done = ans && (ans.selected.length > 0 || ans.text.trim().length > 0);
              return (
                <button
                  key={qq.id}
                  onClick={() => {
                    autosave(questions[currentIdx].id);
                    setCurrentIdx(i);
                  }}
                  className={`w-7 h-7 text-xs font-medium rounded-lg transition-colors ${
                    i === currentIdx
                      ? "bg-orange-500 text-white"
                      : done
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {currentIdx < questions.length - 1 ? (
            <button
              onClick={goNext}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
