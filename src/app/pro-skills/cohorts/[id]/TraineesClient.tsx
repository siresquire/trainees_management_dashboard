"use client";

import { useState } from "react";
import { toProperCase } from "@/lib/utils";

type Trainee = {
  id: string;
  full_name: string;
  personal_email: string;
  amalitech_email: string | null;
};

type Session = {
  id: string;
  title: string;
  session_date: string;
  topic: string | null;
};

type AttendanceRow = {
  session_id: string;
  trainee_id: string;
  status: string;
};

type Assignment = {
  id: string;
  title: string;
  due_date: string | null;
};

type SubmissionRow = {
  assignment_id: string;
  trainee_id: string;
  completed: boolean;
};

type Props = {
  cohortId: string;
  cohortLevel: string;
  trainees: Trainee[];
  sessions: Session[];
  attendance: AttendanceRow[];
  assignments: Assignment[];
  submissions: SubmissionRow[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_DOT: Record<string, string> = {
  present: "bg-green-500",
  late: "bg-amber-400",
  absent: "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
};

const SHOW_AMALITECH = ["associate", "devops"];

export default function TraineesClient({
  cohortLevel,
  trainees,
  sessions,
  attendance,
  assignments,
  submissions,
}: Props) {
  const [selectedTrainee, setSelectedTrainee] = useState<Trainee | null>(null);

  const showAmalitech = SHOW_AMALITECH.includes(cohortLevel);

  // Build lookups
  // attendance: traineeId → sessionId → status
  const attMap: Record<string, Record<string, string>> = {};
  for (const row of attendance) {
    if (!attMap[row.trainee_id]) attMap[row.trainee_id] = {};
    attMap[row.trainee_id][row.session_id] = row.status;
  }

  // submissions: traineeId → assignmentId → completed
  const subMap: Record<string, Record<string, boolean>> = {};
  for (const row of submissions) {
    if (!subMap[row.trainee_id]) subMap[row.trainee_id] = {};
    subMap[row.trainee_id][row.assignment_id] = row.completed;
  }

  function sessionsAttended(traineeId: string): number {
    const traineeAtt = attMap[traineeId] ?? {};
    return Object.values(traineeAtt).filter(
      (s) => s === "present" || s === "late"
    ).length;
  }

  function assignmentsDone(traineeId: string): number {
    const traineeSubs = subMap[traineeId] ?? {};
    return Object.values(traineeSubs).filter(Boolean).length;
  }

  const totalAssignments = assignments.length;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Trainees{" "}
          <span className="text-slate-400 font-normal ml-1">
            ({trainees.length})
          </span>
        </h2>
      </div>

      {trainees.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">No trainees in this cohort yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                  Personal Email
                </th>
                {showAmalitech && (
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                    Amalitech Email
                  </th>
                )}
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                  Sessions
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                  Done
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {trainees.map((t) => {
                const attended = sessionsAttended(t.id);
                const done = assignmentsDone(t.id);
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedTrainee(t)}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {toProperCase(t.full_name)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {t.personal_email}
                    </td>
                    {showAmalitech && (
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                        {t.amalitech_email ?? (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">
                      {attended > 0 ? (
                        attended
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">
                      {totalAssignments > 0 ? (
                        `${done}/${totalAssignments}`
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Side pane */}
      {selectedTrainee && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelectedTrainee(null)}
          />
          {/* Pane */}
          <div className="relative w-full max-w-sm bg-white shadow-xl flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                  {toProperCase(selectedTrainee.full_name)}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedTrainee.personal_email}
                </p>
                {showAmalitech && selectedTrainee.amalitech_email && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedTrainee.amalitech_email}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedTrainee(null)}
                className="ml-4 flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Sessions */}
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
                Sessions ({sessions.length})
              </h3>
              {sessions.length === 0 ? (
                <p className="text-xs text-slate-400">No sessions yet.</p>
              ) : (
                <ul className="space-y-2">
                  {sessions.map((s) => {
                    const status =
                      attMap[selectedTrainee.id]?.[s.id] ?? null;
                    return (
                      <li key={s.id} className="flex items-start gap-2.5">
                        {status ? (
                          <>
                            <span
                              className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-800 truncate">
                                {s.title}
                              </p>
                              <p className="text-xs text-slate-400">
                                {fmtDate(s.session_date)} ·{" "}
                                <span
                                  className={
                                    status === "present"
                                      ? "text-green-600"
                                      : status === "late"
                                      ? "text-amber-600"
                                      : "text-red-600"
                                  }
                                >
                                  {STATUS_LABEL[status]}
                                </span>
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="mt-0.5 flex-shrink-0 w-2 h-2 rounded-full bg-slate-200" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-800 truncate">
                                {s.title}
                              </p>
                              <p className="text-xs text-slate-400">
                                {fmtDate(s.session_date)} ·{" "}
                                <span className="text-slate-300">—</span>
                              </p>
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Assignments */}
            <div className="px-6 py-4">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
                Assignments ({assignments.length})
              </h3>
              {assignments.length === 0 ? (
                <p className="text-xs text-slate-400">No assignments yet.</p>
              ) : (
                <ul className="space-y-2">
                  {assignments.map((a) => {
                    const done =
                      subMap[selectedTrainee.id]?.[a.id] ?? false;
                    return (
                      <li key={a.id} className="flex items-start gap-2.5">
                        {done ? (
                          <svg
                            className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 12H4"
                            />
                          </svg>
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-medium truncate ${
                              done ? "text-slate-800" : "text-slate-500"
                            }`}
                          >
                            {a.title}
                          </p>
                          {a.due_date && (
                            <p className="text-xs text-slate-400">
                              Due {fmtDate(a.due_date)}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
