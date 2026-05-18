"use client";

import { useState, useTransition, useActionState, useEffect } from "react";
import {
  updateQuestionBank,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  shareQuestionBank,
  revokeShare,
  importQuestionsFromCsv,
  type QuestionState,
  type ShareState,
  type CsvImportState,
} from "@/actions/question-banks";
import { createQuizAssignment, type AssignmentState } from "@/actions/quiz-assignments";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  time_seconds: number | null;
  explanation: string | null;
  display_order: number;
};

type Bank = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  tags: string[] | null;
  is_public: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Share = {
  id: string;
  shared_with: string;
  can_edit: boolean;
  profiles: { full_name: string } | null;
};

type Cohort = { id: string; name: string; level: string };

const Q_TYPE_LABEL: Record<string, string> = {
  mcq:          "Multiple Choice",
  multi_select: "Multi-Select",
  true_false:   "True / False",
  short_answer: "Short Answer",
  code_input:   "Code Input",
};

const Q_TYPE_COLOR: Record<string, string> = {
  mcq:          "bg-blue-100 text-blue-700",
  multi_select: "bg-purple-100 text-purple-700",
  true_false:   "bg-green-100 text-green-700",
  short_answer: "bg-amber-100 text-amber-700",
  code_input:   "bg-rose-100 text-rose-700",
};

const LEVEL_LABEL: Record<string, string> = {
  practitioner: "Practitioner",
  associate:    "Associate",
  devops:       "DevOps",
};

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

// ── Main component ─────────────────────────────────────────────────────────────

export default function QuestionBankClient({
  bank: initialBank,
  questions: initialQuestions,
  shares: initialShares,
  isOwner,
  canEdit,
  cohorts,
}: {
  bank: Bank;
  questions: Question[];
  shares: Share[];
  isOwner: boolean;
  canEdit: boolean;
  userId: string;
  cohorts: Cohort[];
}) {
  const [tab, setTab]           = useState<"questions" | "settings" | "sharing">("questions");
  const [showAssign, setShowAssign] = useState(false);
  const router                  = useRouter();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900 truncate">{initialBank.name}</h1>
              {initialBank.level && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  {LEVEL_LABEL[initialBank.level] ?? initialBank.level}
                </span>
              )}
              {initialBank.is_public && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Public
                </span>
              )}
              {!isOwner && canEdit && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Editor
                </span>
              )}
              {!isOwner && !canEdit && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Viewer
                </span>
              )}
            </div>
            {initialBank.description && (
              <p className="text-sm text-slate-500">{initialBank.description}</p>
            )}
            {(initialBank.tags ?? []).length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                {(initialBank.tags ?? []).map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-400">
              {initialQuestions.length} question{initialQuestions.length !== 1 ? "s" : ""}
            </span>
            {cohorts.length > 0 && (
              <button
                onClick={() => setShowAssign(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-orange-600 border border-orange-300 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Assign to cohort
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-slate-200 -mb-6 pb-0">
          {(["questions", ...(isOwner ? ["settings", "sharing"] : [])] as Array<"questions" | "settings" | "sharing">).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px",
                tab === t
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Assign to cohort modal */}
      {showAssign && (
        <AssignModal
          bankId={initialBank.id}
          bankName={initialBank.name}
          questionCount={initialQuestions.length}
          cohorts={cohorts}
          onClose={() => setShowAssign(false)}
        />
      )}

      {/* Tab content */}
      {tab === "questions" && (
        <QuestionsTab
          bankId={initialBank.id}
          questions={initialQuestions}
          canEdit={canEdit}
          router={router}
        />
      )}
      {tab === "settings" && isOwner && (
        <SettingsTab bank={initialBank} />
      )}
      {tab === "sharing" && isOwner && (
        <SharingTab bankId={initialBank.id} shares={initialShares} />
      )}
    </div>
  );
}

// ── Questions tab ─────────────────────────────────────────────────────────────

function QuestionsTab({
  bankId,
  questions,
  canEdit,
  router,
}: {
  bankId: string;
  questions: Question[];
  canEdit: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [importing,   setImporting]   = useState(false);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowAddForm((v) => !v); setEditingId(null); }}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add question
          </button>
          <button
            onClick={() => setImporting((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 border border-slate-300 hover:border-slate-400 hover:text-slate-800 px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>
        </div>
      )}

      {/* CSV import panel */}
      {importing && canEdit && (
        <CsvImportPanel bankId={bankId} onClose={() => setImporting(false)} />
      )}

      {/* Add question form */}
      {showAddForm && canEdit && (
        <div className="bg-white border border-orange-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">New question</h3>
          <QuestionForm
            bankId={bankId}
            onSuccess={() => { setShowAddForm(false); router.refresh(); }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Question list */}
      {questions.length === 0 && !showAddForm ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No questions yet</p>
          {canEdit && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-3 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Add your first question →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id}>
              {editingId === q.id ? (
                <div className="bg-white border border-orange-200 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">Edit question</h3>
                  <QuestionForm
                    bankId={bankId}
                    existing={q}
                    onSuccess={() => { setEditingId(null); router.refresh(); }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <QuestionRow
                  q={q}
                  idx={idx}
                  bankId={bankId}
                  canEdit={canEdit}
                  onEdit={() => { setEditingId(q.id); setShowAddForm(false); }}
                  onDeleted={() => router.refresh()}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Question row (collapsed view) ─────────────────────────────────────────────

function QuestionRow({
  q,
  idx,
  bankId,
  canEdit,
  onEdit,
  onDeleted,
}: {
  q: Question;
  idx: number;
  bankId: string;
  canEdit: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, startDelete] = useTransition();

  async function handleDelete() {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    startDelete(async () => {
      const res = await deleteQuestion(q.id, bankId);
      if (res.error) toast(res.error, "error");
      else { toast("Question deleted"); onDeleted(); }
    });
  }

  const options = [
    { key: "A", val: q.option_a },
    { key: "B", val: q.option_b },
    { key: "C", val: q.option_c },
    { key: "D", val: q.option_d },
    { key: "E", val: q.option_e },
    { key: "F", val: q.option_f },
  ].filter((o) => o.val);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          <span className="text-xs font-mono text-slate-400 mt-0.5 w-5 text-right flex-shrink-0">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${Q_TYPE_COLOR[q.question_type] ?? "bg-slate-100 text-slate-600"}`}>
                {Q_TYPE_LABEL[q.question_type] ?? q.question_type}
              </span>
              <span className="text-xs text-slate-400">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
              {q.time_seconds && (
                <span className="text-xs text-slate-400">{q.time_seconds}s</span>
              )}
            </div>
            <p className="text-sm text-slate-800 line-clamp-2">{q.question_text}</p>
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform mt-0.5 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50">
          {/* Options */}
          {options.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-1">
              {options.map((o) => (
                <div
                  key={o.key}
                  className={[
                    "flex items-start gap-2 text-sm rounded-lg px-3 py-1.5",
                    (q.correct_answers ?? []).includes(o.key)
                      ? "bg-green-100 text-green-800 font-medium"
                      : "bg-white border border-slate-200 text-slate-700",
                  ].join(" ")}
                >
                  <span className="font-mono text-xs opacity-60 mt-0.5">{o.key}.</span>
                  <span>{o.val}</span>
                </div>
              ))}
            </div>
          )}

          {/* True/False display */}
          {q.question_type === "true_false" && (
            <div className="flex gap-2">
              {["TRUE", "FALSE"].map((v) => (
                <span
                  key={v}
                  className={[
                    "text-sm font-medium px-3 py-1 rounded-lg capitalize",
                    (q.correct_answers ?? []).map((s) => s.toUpperCase()).includes(v)
                      ? "bg-green-100 text-green-800"
                      : "bg-white border border-slate-200 text-slate-500",
                  ].join(" ")}
                >
                  {v.charAt(0) + v.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
          )}

          {/* Short/Code model answer */}
          {(q.question_type === "short_answer" || q.question_type === "code_input") && (
            q.correct_answers?.length ? (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-400 mb-1">Model answer</p>
                <p className={`text-sm text-slate-700 ${q.question_type === "code_input" ? "font-mono whitespace-pre-wrap text-xs" : ""}`}>
                  {q.correct_answers[0]}
                </p>
              </div>
            ) : null
          )}

          {/* Explanation */}
          {q.explanation && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-500 mb-0.5">Explanation</p>
              <p className="text-sm text-blue-800">{q.explanation}</p>
            </div>
          )}

          {/* Actions */}
          {canEdit && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={onEdit}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Question form (add / edit) ────────────────────────────────────────────────

function QuestionForm({
  bankId,
  existing,
  onSuccess,
  onCancel,
}: {
  bankId: string;
  existing?: Question;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [qType,     setQType]     = useState(existing?.question_type ?? "mcq");
  const [isPending, startTransition] = useTransition();
  const [error,     setError]     = useState<string | null>(null);
  const [optionCount, setOptionCount] = useState(() => {
    if (!existing) return 4;
    const opts = [existing.option_a, existing.option_b, existing.option_c,
                  existing.option_d, existing.option_e, existing.option_f];
    return Math.max(4, opts.filter(Boolean).length);
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      let res: QuestionState;
      if (existing) {
        res = await updateQuestion(existing.id, fd);
      } else {
        res = await createQuestion(null, fd);
      }
      if (res?.error) { setError(res.error); return; }
      if (res?.errors) {
        const msgs = Object.values(res.errors).flat().join("; ");
        setError(msgs); return;
      }
      toast(existing ? "Question updated" : "Question added");
      onSuccess();
    });
  }

  const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];
  const needsOptions = qType === "mcq" || qType === "multi_select";
  const isTextType   = qType === "short_answer" || qType === "code_input";

  const existingCorrect = existing?.correct_answers ?? [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="bank_id" value={bankId} />
      {existing && <input type="hidden" name="display_order" value={existing.display_order} />}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Question type */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Question type</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(Q_TYPE_LABEL).map(([val, label]) => (
            <label
              key={val}
              className={[
                "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-colors",
                qType === val
                  ? "bg-orange-50 border-orange-300 text-orange-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name="question_type"
                value={val}
                checked={qType === val}
                onChange={() => setQType(val)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Question text *</label>
        <textarea
          name="question_text"
          rows={3}
          required
          defaultValue={existing?.question_text ?? ""}
          placeholder={qType === "code_input"
            ? "Write a function that reverses a string…"
            : "Enter your question here…"}
          className={inputCls}
        />
      </div>

      {/* Options for MCQ / multi-select */}
      {needsOptions && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-600">Options</label>
            {optionCount < 6 && (
              <button
                type="button"
                onClick={() => setOptionCount((n) => Math.min(n + 1, 6))}
                className="text-xs text-orange-600 hover:text-orange-700"
              >
                + Add option
              </button>
            )}
          </div>
          {OPTION_KEYS.slice(0, optionCount).map((key, i) => {
            const fieldName = `option_${key.toLowerCase()}` as `option_${string}`;
            const existingVal = existing?.[fieldName as keyof Question] as string | null;
            const isCorrect = existingCorrect.includes(key);
            return (
              <div key={key} className="flex items-center gap-2">
                {qType === "mcq" ? (
                  <input
                    type="radio"
                    name="correct_answer"
                    value={key}
                    defaultChecked={isCorrect}
                    className="flex-shrink-0 text-orange-500 focus:ring-orange-500"
                    required={i === 0}
                  />
                ) : (
                  <input
                    type="checkbox"
                    name="correct_answers"
                    value={key}
                    defaultChecked={isCorrect}
                    className="flex-shrink-0 rounded text-orange-500 focus:ring-orange-500"
                  />
                )}
                <span className="text-xs font-mono text-slate-400 w-4 flex-shrink-0">{key}.</span>
                <input
                  type="text"
                  name={`option_${key.toLowerCase()}`}
                  defaultValue={existingVal ?? ""}
                  placeholder={`Option ${key}`}
                  required={i < 2}
                  className={inputCls}
                />
                {optionCount > 2 && i >= 2 && (
                  <button
                    type="button"
                    onClick={() => setOptionCount(i)}
                    className="text-slate-300 hover:text-red-400 flex-shrink-0"
                    title="Remove option"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-slate-400">
            {qType === "mcq" ? "Select the correct answer using the radio button." : "Check all correct answers."}
          </p>
        </div>
      )}

      {/* True / False */}
      {qType === "true_false" && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Correct answer</label>
          <div className="flex gap-3">
            {["TRUE", "FALSE"].map((val) => (
              <label
                key={val}
                className={[
                  "flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border cursor-pointer transition-colors",
                  existingCorrect.map((s) => s.toUpperCase()).includes(val)
                    ? "bg-green-50 border-green-300 text-green-700"
                    : "border-slate-200 text-slate-600",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="correct_answer"
                  value={val}
                  defaultChecked={existingCorrect.map((s) => s.toUpperCase()).includes(val)}
                  required
                  className="sr-only"
                />
                {val.charAt(0) + val.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Short answer / Code model answer */}
      {isTextType && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Model answer <span className="text-slate-400 font-normal">(optional — trainer reference only)</span>
          </label>
          <textarea
            name="correct_answers"  // will be parsed as single item array
            rows={qType === "code_input" ? 5 : 3}
            defaultValue={existingCorrect[0] ?? ""}
            placeholder={qType === "code_input"
              ? "def reverse_string(s):\n    return s[::-1]"
              : "Expected answer…"}
            className={`${inputCls} ${qType === "code_input" ? "font-mono text-xs" : ""}`}
          />
          {qType === "code_input" && (
            <p className="text-xs text-slate-400 mt-1">
              Code is not executed — this is a text reference for the trainer when grading.
            </p>
          )}
        </div>
      )}

      {/* Points + time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Points</label>
          <input
            type="number"
            name="points"
            min={0.5}
            step={0.5}
            defaultValue={existing?.points ?? 1}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Time limit <span className="text-slate-400 font-normal">(seconds, optional)</span>
          </label>
          <input
            type="number"
            name="time_seconds"
            min={10}
            step={5}
            defaultValue={existing?.time_seconds ?? ""}
            placeholder="e.g. 60"
            className={inputCls}
          />
        </div>
      </div>

      {/* Explanation */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          Explanation <span className="text-slate-400 font-normal">(shown to trainee after grading)</span>
        </label>
        <textarea
          name="explanation"
          rows={2}
          defaultValue={existing?.explanation ?? ""}
          placeholder="Why is this the correct answer?"
          className={inputCls}
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Saving…" : existing ? "Save changes" : "Add question"}
        </button>
      </div>
    </form>
  );
}

// ── CSV import panel ──────────────────────────────────────────────────────────

function CsvImportPanel({ bankId, onClose }: { bankId: string; onClose: () => void }) {
  const [state, action, isPending] = useActionState(importQuestionsFromCsv, null as CsvImportState);

  // Fire toast when action resolves
  useEffect(() => {
    if (!state) return;
    if (state.error) { toast(state.error, "error"); return; }
    if (state.inserted !== undefined) {
      toast(`Imported ${state.inserted} question${state.inserted !== 1 ? "s" : ""}${state.skipped ? `, ${state.skipped} skipped` : ""}`);
      onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Import questions</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="font-medium text-slate-700">Fill the template and upload it below</p>
          <a
            href="/api/templates/question-bank"
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-200 hover:border-orange-300 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download template (.xlsx)
          </a>
        </div>
        <p>Accepts <strong>.xlsx</strong> or <strong>.csv</strong>. Required columns: <code className="bg-white px-1 rounded font-mono">type, question, correct_answers</code></p>
        <p><strong>type</strong> values: mcq, multi_select, true_false, short_answer, code_input</p>
        <p><strong>correct_answers</strong>: letter(s) for MCQ/multi-select (e.g. <code className="bg-white px-1 rounded">A</code> or <code className="bg-white px-1 rounded">A,C</code>); <code className="bg-white px-1 rounded">TRUE</code>/<code className="bg-white px-1 rounded">FALSE</code> for true_false; model answer text for short_answer/code_input.</p>
      </div>

      <form action={action} encType="multipart/form-data">
        <input type="hidden" name="bank_id" value={bankId} />
        <div className="flex items-center gap-4">
          <input
            name="questions_file"
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            required
            className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 file:cursor-pointer"
          />
          <button
            type="submit"
            disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {isPending ? "Importing…" : "Import"}
          </button>
        </div>
        {state?.error && (
          <p className="text-xs text-red-600 mt-2">{state.error}</p>
        )}
      </form>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ bank }: { bank: Bank }) {
  const [isPending, startTransition] = useTransition();
  const [success,   setSuccess]      = useState(false);
  const [error,     setError]        = useState<string | null>(null);
  const router                       = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setSuccess(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateQuestionBank(bank.id, fd);
      if (res.error) { setError(res.error); toast(res.error, "error"); return; }
      setSuccess(true);
      toast("Bank settings saved");
      router.refresh();
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-4">Bank settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Name *</label>
          <input name="name" type="text" required defaultValue={bank.name} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
          <textarea name="description" rows={3} defaultValue={bank.description ?? ""} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Level</label>
          <select name="level" defaultValue={bank.level ?? ""} className={inputCls}>
            <option value="">— Any level —</option>
            <option value="practitioner">Practitioner</option>
            <option value="associate">Associate</option>
            <option value="devops">DevOps</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Tags</label>
          <input
            name="tags"
            type="text"
            defaultValue={(bank.tags ?? []).join(", ")}
            placeholder="EC2, S3, IAM"
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1">Comma-separated</p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="is_public"
            value="1"
            defaultChecked={bank.is_public}
            className="mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />
          <div>
            <p className="text-sm font-medium text-slate-700">Make public</p>
            <p className="text-xs text-slate-400 mt-0.5">Visible (read-only) to all trainers on the platform.</p>
          </div>
        </label>

        <div className="flex items-center justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Sharing tab ───────────────────────────────────────────────────────────────

function SharingTab({ bankId, shares }: { bankId: string; shares: Share[] }) {
  const [shareState, shareAction, shareIsPending] = useActionState(shareQuestionBank, null as ShareState);
  const [revoking,   startRevoke]                 = useTransition();
  const router                                    = useRouter();

  useEffect(() => {
    if (!shareState) return;
    if (shareState.error) toast(shareState.error, "error");
    else if (shareState.success) { toast("Bank shared"); router.refresh(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareState]);

  async function handleRevoke(sharedWithId: string, name: string) {
    if (!confirm(`Remove access for ${name}?`)) return;
    startRevoke(async () => {
      const res = await revokeShare(bankId, sharedWithId);
      if (res.error) toast(res.error, "error");
      else { toast("Access removed"); router.refresh(); }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Share this bank</h2>
        <p className="text-xs text-slate-500">
          Share with another trainer or quiz creator by their account email.
        </p>
      </div>

      <form action={shareAction} className="space-y-3 max-w-md">
        <input type="hidden" name="bank_id" value={bankId} />

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Email address</label>
          <input
            name="email"
            type="email"
            required
            placeholder="trainer@amalitech.org"
            className={inputCls}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
          <input
            type="checkbox"
            name="can_edit"
            value="1"
            className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />
          Allow this person to add and edit questions
        </label>

        {shareState?.error && (
          <p className="text-xs text-red-600">{shareState.error}</p>
        )}

        <button
          type="submit"
          disabled={shareIsPending}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {shareIsPending ? "Sharing…" : "Share"}
        </button>
      </form>

      {/* Current shares */}
      {shares.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-700 mb-2">Current access</h3>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {s.profiles?.full_name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {s.can_edit ? "Can view & edit" : "View only"}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(s.shared_with, s.profiles?.full_name ?? "this user")}
                  disabled={revoking}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assign to Cohort modal ─────────────────────────────────────────────────────

function AssignModal({
  bankId,
  bankName,
  questionCount,
  cohorts,
  onClose,
}: {
  bankId: string;
  bankName: string;
  questionCount: number;
  cohorts: Cohort[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AssignmentState, FormData>(
    createQuizAssignment,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      toast("Quiz assigned to cohort!");
      router.refresh();
      onClose();
    }
    if (state?.error) toast(state.error, "error");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Assign to Cohort</h3>
            <p className="text-xs text-slate-500 mt-0.5">{bankName} · {questionCount} questions</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form action={formAction} className="px-6 py-5 space-y-4">
          <input type="hidden" name="bank_id" value={bankId} />

          {/* Cohort */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cohort <span className="text-red-500">*</span>
            </label>
            <select name="cohort_id" required className={inputCls}>
              <option value="">Select cohort…</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.level})
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Quiz Title <span className="text-red-500">*</span>
            </label>
            <input type="text" name="title" required maxLength={200} className={inputCls}
              defaultValue={bankName} placeholder="e.g. Week 3 AWS Quiz" />
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Questions per student</label>
              <input type="number" name="questions_per_student" min={1} max={500}
                defaultValue={Math.min(10, questionCount)} className={inputCls} />
            </div>
          </div>

          {/* Time limit + Attempts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time limit (mins)</label>
              <input type="number" name="time_limit_mins" min={1}
                placeholder="No limit" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Attempts allowed</label>
              <input type="number" name="attempts_allowed" min={1} max={10}
                defaultValue={1} className={inputCls} />
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
              <span className="text-sm text-slate-700">Show score after submission</span>
            </label>
          </div>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {pending ? "Assigning…" : "Assign Quiz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
