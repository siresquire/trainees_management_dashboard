"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProSkillsAssignment,
  deleteProSkillsAssignment,
  toggleProSkillsSubmission,
} from "@/actions/pro-skills";
import { toProperCase } from "@/lib/utils";

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  instructor_id: string;
};

type Trainee = {
  id: string;
  full_name: string;
};

type Submission = {
  assignment_id: string;
  trainee_id: string;
  completed: boolean;
  completed_at: string | null;
};

type Props = {
  cohortId:    string;
  assignments: Assignment[];
  trainees:    Trainee[];
  submissions: Submission[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function Tick({
  checked,
  pending,
  onChange,
}: {
  checked: boolean;
  pending: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={pending}
      className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all duration-150 ${
        checked
          ? "bg-orange-500 border-orange-500"
          : "bg-white border-slate-300 hover:border-orange-400"
      } ${pending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6l3 3 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {pending && !checked && (
        <div className="w-2.5 h-2.5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
      )}
    </button>
  );
}

export default function AssignmentsClient({ cohortId, assignments, trainees, submissions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // New assignment form
  const [showNewForm, setShowNewForm]     = useState(false);
  const [newTitle, setNewTitle]           = useState("");
  const [newDesc, setNewDesc]             = useState("");
  const [newDueDate, setNewDueDate]       = useState("");
  const [newFormError, setNewFormError]   = useState("");

  // Expanded assignment
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Per-assignment errors
  const [rowErrors, setRowErrors]   = useState<Record<string, string>>({});

  // Optimistic submission state: "assignmentId:traineeId" → completed
  const [optSubs, setOptSubs] = useState<Record<string, boolean>>({});

  // Per-item pending keys
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const refresh = () => router.refresh();

  // Build lookup: assignmentId → traineeId → submission
  const subMap: Record<string, Record<string, Submission>> = {};
  for (const s of submissions) {
    if (!subMap[s.assignment_id]) subMap[s.assignment_id] = {};
    subMap[s.assignment_id][s.trainee_id] = s;
  }

  function isCompleted(assignmentId: string, traineeId: string): boolean {
    const key = `${assignmentId}:${traineeId}`;
    if (key in optSubs) return optSubs[key];
    return subMap[assignmentId]?.[traineeId]?.completed ?? false;
  }

  function handleToggle(assignmentId: string, traineeId: string, newCompleted: boolean) {
    const key = `${assignmentId}:${traineeId}`;
    setOptSubs((p) => ({ ...p, [key]: newCompleted }));
    setPendingKeys((p) => new Set(p).add(key));
    toggleProSkillsSubmission(assignmentId, traineeId, cohortId, newCompleted).then((res) => {
      setPendingKeys((p) => { const n = new Set(p); n.delete(key); return n; });
      if ("error" in res && res.error) {
        setOptSubs((p) => ({ ...p, [key]: !newCompleted }));
        setRowErrors((p) => ({ ...p, [assignmentId]: res.error! }));
        return;
      }
      setRowErrors((p) => { const n = { ...p }; delete n[assignmentId]; return n; });
      refresh();
    });
  }

  function handleCreateAssignment(e: React.FormEvent) {
    e.preventDefault();
    setNewFormError("");
    if (!newTitle.trim()) { setNewFormError("Title is required."); return; }
    startTransition(async () => {
      const res = await createProSkillsAssignment(cohortId, {
        title:       newTitle.trim(),
        description: newDesc.trim() || undefined,
        due_date:    newDueDate || undefined,
      });
      if ("error" in res && res.error) { setNewFormError(res.error); return; }
      setShowNewForm(false);
      setNewTitle(""); setNewDesc(""); setNewDueDate("");
      refresh();
    });
  }

  function handleDelete(assignmentId: string) {
    startTransition(async () => {
      const res = await deleteProSkillsAssignment(assignmentId, cohortId);
      if ("error" in res && res.error) {
        setRowErrors((p) => ({ ...p, [assignmentId]: res.error! }));
        return;
      }
      setConfirmDeleteId(null);
      if (expandedId === assignmentId) setExpandedId(null);
      refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Assignments <span className="text-slate-400 font-normal ml-1">({assignments.length})</span>
        </h2>
        <button
          onClick={() => { setShowNewForm((v) => !v); setNewFormError(""); }}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Assignment
        </button>
      </div>

      {/* New assignment form */}
      {showNewForm && (
        <form
          onSubmit={handleCreateAssignment}
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-900">New Assignment</h3>
          {newFormError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{newFormError}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. CV Workshop"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
              placeholder="Brief description of the assignment"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Due date (optional)</label>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Creating…" : "Create Assignment"}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewForm(false); setNewFormError(""); }}
              className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Assignment list */}
      {assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">No assignments yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => {
            const isExpanded  = expandedId === assignment.id;
            const doneCount   = trainees.filter((t) => isCompleted(assignment.id, t.id)).length;
            const totalCount  = trainees.length;

            return (
              <div key={assignment.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Assignment header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{assignment.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {assignment.due_date && <>Due {fmtDate(assignment.due_date)} · </>}
                        {doneCount} / {totalCount} done
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      totalCount > 0 && doneCount === totalCount
                        ? "bg-green-100 text-green-700"
                        : doneCount > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {doneCount}/{totalCount}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(assignment.id); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete assignment"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Delete confirm */}
                {confirmDeleteId === assignment.id && (
                  <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex items-center justify-between gap-4">
                    <p className="text-xs text-red-700 font-medium">Delete this assignment and all submission records?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(assignment.id)}
                        disabled={isPending}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="border border-slate-200 text-slate-600 hover:bg-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                    {assignment.description && (
                      <p className="text-sm text-slate-600">{assignment.description}</p>
                    )}

                    {rowErrors[assignment.id] && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{rowErrors[assignment.id]}</p>
                    )}

                    {trainees.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Trainee</th>
                              <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">Done</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {trainees.map((t) => {
                              const done = isCompleted(assignment.id, t.id);
                              const key = `${assignment.id}:${t.id}`;
                              const pending = pendingKeys.has(key);
                              return (
                                <tr key={t.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 text-slate-900 font-medium">
                                    {toProperCase(t.full_name)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-center">
                                      <Tick
                                        checked={done}
                                        pending={pending}
                                        onChange={() => handleToggle(assignment.id, t.id, !done)}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No trainees in this cohort yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
