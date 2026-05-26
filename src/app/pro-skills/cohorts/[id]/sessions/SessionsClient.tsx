"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createProSkillsSession,
  deleteProSkillsSession,
  saveProSkillsAttendance,
  uploadProSkillsAttendanceCsv,
} from "@/actions/pro-skills";

type Session = {
  id: string;
  title: string;
  session_date: string;
  topic: string | null;
  created_at: string;
  instructor_id: string;
};

type Trainee = {
  id: string;
  full_name: string;
  personal_email: string;
  amalitech_email: string | null;
};

type AttendanceRow = {
  session_id: string;
  trainee_id: string;
  status: string;
};

type Props = {
  cohortId:   string;
  sessions:   Session[];
  trainees:   Trainee[];
  attendance: AttendanceRow[];
};

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late",    label: "Late"    },
  { value: "absent",  label: "Absent"  },
];

const STATUS_BADGE: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  late:    "bg-amber-100 text-amber-700",
  absent:  "bg-red-100 text-red-600",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function SessionsClient({ cohortId, sessions, trainees, attendance }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // New session form
  const [showNewForm, setShowNewForm]   = useState(false);
  const [newTitle, setNewTitle]         = useState("");
  const [newDate, setNewDate]           = useState("");
  const [newTopic, setNewTopic]         = useState("");
  const [newFormError, setNewFormError] = useState("");

  // Expanded session
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Per-session attendance state: sessionId → traineeId → status
  const [attEdits, setAttEdits] = useState<Record<string, Record<string, string>>>({});

  // Per-session errors/messages
  const [rowErrors, setRowErrors]   = useState<Record<string, string>>({});
  const [rowSuccess, setRowSuccess] = useState<Record<string, string>>({});

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // CSV refs
  const csvRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = () => router.refresh();

  // Build lookup: sessionId → traineeId → status
  const attBySession: Record<string, Record<string, string>> = {};
  for (const row of attendance) {
    if (!attBySession[row.session_id]) attBySession[row.session_id] = {};
    attBySession[row.session_id][row.trainee_id] = row.status;
  }

  function getStatus(sessionId: string, traineeId: string): string {
    return attEdits[sessionId]?.[traineeId]
      ?? attBySession[sessionId]?.[traineeId]
      ?? "absent";
  }

  function setStatus(sessionId: string, traineeId: string, status: string) {
    setAttEdits((prev) => ({
      ...prev,
      [sessionId]: { ...(prev[sessionId] ?? {}), [traineeId]: status },
    }));
  }

  function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    setNewFormError("");
    if (!newTitle.trim()) { setNewFormError("Title is required."); return; }
    if (!newDate)          { setNewFormError("Date is required.");  return; }
    startTransition(async () => {
      const res = await createProSkillsSession(cohortId, {
        title:        newTitle.trim(),
        session_date: newDate,
        topic:        newTopic.trim() || undefined,
      });
      if ("error" in res && res.error) { setNewFormError(res.error); return; }
      setShowNewForm(false);
      setNewTitle(""); setNewDate(""); setNewTopic("");
      refresh();
    });
  }

  function handleSaveAttendance(sessionId: string) {
    setRowErrors((p)   => ({ ...p, [sessionId]: "" }));
    setRowSuccess((p)  => ({ ...p, [sessionId]: "" }));
    const records = trainees.map((t) => ({
      trainee_id: t.id,
      status:     getStatus(sessionId, t.id),
    }));
    startTransition(async () => {
      const res = await saveProSkillsAttendance(sessionId, cohortId, records);
      if ("error" in res && res.error) {
        setRowErrors((p) => ({ ...p, [sessionId]: res.error! }));
        return;
      }
      setRowSuccess((p) => ({ ...p, [sessionId]: "Attendance saved." }));
      // Clear local edits for this session
      setAttEdits((p) => { const n = { ...p }; delete n[sessionId]; return n; });
      refresh();
    });
  }

  function handleCsvUpload(e: React.FormEvent<HTMLFormElement>, sessionId: string) {
    e.preventDefault();
    setRowErrors((p)   => ({ ...p, [sessionId]: "" }));
    setRowSuccess((p)  => ({ ...p, [sessionId]: "" }));
    const fileInput = csvRefs.current[sessionId];
    const file = fileInput?.files?.[0];
    if (!file) { setRowErrors((p) => ({ ...p, [sessionId]: "Please select a CSV file." })); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      startTransition(async () => {
        const res = await uploadProSkillsAttendanceCsv(sessionId, cohortId, text);
        if ("error" in res && res.error) {
          setRowErrors((p) => ({ ...p, [sessionId]: res.error! }));
          return;
        }
        const matched = "matched" in res ? res.matched : 0;
        setRowSuccess((p) => ({ ...p, [sessionId]: `CSV imported — ${matched} present.` }));
        if (fileInput) fileInput.value = "";
        refresh();
      });
    };
    reader.readAsText(file);
  }

  function handleDelete(sessionId: string) {
    startTransition(async () => {
      const res = await deleteProSkillsSession(sessionId, cohortId);
      if ("error" in res && res.error) {
        setRowErrors((p) => ({ ...p, [sessionId]: res.error! }));
        return;
      }
      setConfirmDeleteId(null);
      if (expandedId === sessionId) setExpandedId(null);
      refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Sessions <span className="text-slate-400 font-normal ml-1">({sessions.length})</span>
        </h2>
        <button
          onClick={() => { setShowNewForm((v) => !v); setNewFormError(""); }}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Session
        </button>
      </div>

      {/* New session form */}
      {showNewForm && (
        <form
          onSubmit={handleCreateSession}
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-900">New Session</h3>
          {newFormError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{newFormError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Title <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Week 1 Pro Skills"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Topic (optional)</label>
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="e.g. Communication skills"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Creating…" : "Create Session"}
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

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">No sessions recorded yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const isExpanded = expandedId === session.id;
            const attMap = attBySession[session.id] ?? {};
            const presentCount = Object.values(attMap).filter((s) => s === "present").length;
            const lateCount    = Object.values(attMap).filter((s) => s === "late").length;

            return (
              <div key={session.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Session header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{session.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fmtDate(session.session_date)}
                        {session.topic && <> · {session.topic}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {Object.keys(attMap).length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{presentCount} present</span>
                        {lateCount > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{lateCount} late</span>}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(session.id); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete session"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Delete confirm */}
                {confirmDeleteId === session.id && (
                  <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex items-center justify-between gap-4">
                    <p className="text-xs text-red-700 font-medium">Delete this session and all attendance records?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(session.id)}
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
                  <div className="border-t border-slate-100 px-5 py-4 space-y-5">
                    {rowErrors[session.id] && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{rowErrors[session.id]}</p>
                    )}
                    {rowSuccess[session.id] && (
                      <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{rowSuccess[session.id]}</p>
                    )}

                    {/* Attendance table */}
                    {trainees.length > 0 ? (
                      <>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-3">Attendance</h4>
                          <div className="overflow-x-auto rounded-lg border border-slate-100">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Trainee</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {trainees.map((t) => {
                                  const status = getStatus(session.id, t.id);
                                  return (
                                    <tr key={t.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 text-slate-900 font-medium">{t.full_name}</td>
                                      <td className="px-3 py-2">
                                        <select
                                          value={status}
                                          onChange={(e) => setStatus(session.id, t.id, e.target.value)}
                                          className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600"}`}
                                        >
                                          {STATUS_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <button
                            onClick={() => handleSaveAttendance(session.id)}
                            disabled={isPending}
                            className="mt-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {isPending ? "Saving…" : "Save Attendance"}
                          </button>
                        </div>

                        {/* CSV upload */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-3">Upload CSV</h4>
                          <p className="text-xs text-slate-400 mb-2">
                            Upload a CSV with an &ldquo;Email&rdquo; column. Matched trainees are marked present; all others absent.
                          </p>
                          <form onSubmit={(e) => handleCsvUpload(e, session.id)} className="flex items-center gap-2">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              ref={(el) => { csvRefs.current[session.id] = el; }}
                              className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                            />
                            <button
                              type="submit"
                              disabled={isPending}
                              className="border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              Upload CSV
                            </button>
                          </form>
                        </div>
                      </>
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
