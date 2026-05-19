"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  uploadZoomAttendance,
  createTeamsSession,
  saveManualAttendance,
  uploadTeamsAttendanceCsv,
  deleteSession,
  updateAttendanceThresholds,
} from "@/actions/attendance";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trainee = {
  id: string;
  serial_no: number | null;
  full_name: string;
  personal_email: string;
  amalitech_email: string | null;
};

type Session = {
  id: string;
  platform: "zoom" | "teams";
  topic: string;
  started_at: string;
  total_duration_mins: number;
  week_number: number | null;
  session_number: number | null;
  created_at: string;
};

type AttendanceRow = {
  id: string;
  session_id: string;
  trainee_id: string;
  duration_mins: number;
  total_session_mins: number;
  attendance_pct: number | null;
  status: string;
};

type Props = {
  cohortId:     string;
  cohortLevel:  string;
  presentPct:   number;
  partialPct:   number;
  trainees:     Trainee[];
  sessions:     Session[];
  attendance:   AttendanceRow[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  partial: "Partial",
  brief:   "Brief",
  absent:  "Absent",
};

const STATUS_BADGE: Record<string, string> = {
  present: "bg-green-100  text-green-700",
  partial: "bg-amber-100  text-amber-700",
  brief:   "bg-slate-100  text-slate-600",
  absent:  "bg-red-100    text-red-700",
};

const STATUS_DOT: Record<string, string> = {
  present: "bg-green-500",
  partial: "bg-amber-400",
  brief:   "bg-slate-400",
  absent:  "bg-red-400",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function clientStatus(
  durationMins: number,
  totalMins: number,
  isPractitioner: boolean,
  presentPct: number,
  partialPct: number,
): string {
  if (durationMins <= 0) return "absent";
  if (!isPractitioner) return "present";
  if (totalMins <= 0) return "absent";
  const pct = (durationMins / totalMins) * 100;
  if (pct >= presentPct) return "present";
  if (pct >= partialPct) return "partial";
  return "brief";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AttendanceClient({
  cohortId,
  cohortLevel,
  presentPct,
  partialPct,
  trainees,
  sessions,
  attendance,
}: Props) {
  const router   = useRouter();
  const [isPending, startTransition] = useTransition();

  // Panel visibility
  const [showZoomForm,  setShowZoomForm]  = useState(false);
  const [showTeamsForm, setShowTeamsForm] = useState(false);

  // Which session row is expanded
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Manual attendance entry state: sessionId → { traineeId → durationMins }
  const [manualDurations, setManualDurations] = useState<Record<string, Record<string, string>>>({});

  // Error/success per-section
  const [zoomError,  setZoomError]  = useState("");
  const [teamsError, setTeamsError] = useState("");
  const [rowErrors,  setRowErrors]  = useState<Record<string, string>>({});

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Threshold editing
  const [editThresholds,  setEditThresholds]  = useState(false);
  const [editPresentPct,  setEditPresentPct]  = useState(presentPct);
  const [editPartialPct,  setEditPartialPct]  = useState(partialPct);
  const [thresholdError,  setThresholdError]  = useState("");

  // Refs for file inputs (so we can reset them)
  const zoomFileRef   = useRef<HTMLInputElement>(null);
  const teamsFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = () => router.refresh();

  // ── Build lookup maps ──────────────────────────────────────────────────────
  // attendanceBySession: sessionId → traineeId → row
  const attendanceBySession = new Map<string, Map<string, AttendanceRow>>();
  for (const row of attendance) {
    let m = attendanceBySession.get(row.session_id);
    if (!m) { m = new Map(); attendanceBySession.set(row.session_id, m); }
    m.set(row.trainee_id, row);
  }

  // ── Session stats ──────────────────────────────────────────────────────────
  function sessionStats(sessionId: string) {
    const m = attendanceBySession.get(sessionId);
    const counts = { present: 0, partial: 0, brief: 0, absent: 0 };
    if (!m) return counts;
    for (const row of m.values()) {
      const k = row.status as keyof typeof counts;
      if (k in counts) counts[k]++;
    }
    return counts;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleZoomSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setZoomError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await uploadZoomAttendance(fd);
      if (res.error) { setZoomError(res.error); toast(res.error, "error"); return; }
      toast("Attendance imported from Zoom");
      setShowZoomForm(false);
      if (zoomFileRef.current) zoomFileRef.current.value = "";
      refresh();
    });
  }

  function handleTeamsCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTeamsError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createTeamsSession(fd);
      if (res.error) { setTeamsError(res.error); toast(res.error, "error"); return; }
      toast("Session created");
      setShowTeamsForm(false);
      if (res.sessionId) setExpandedId(res.sessionId);
      refresh();
    });
  }

  function handleManualSave(e: React.FormEvent<HTMLFormElement>, sessionId: string) {
    e.preventDefault();
    setRowErrors((prev) => ({ ...prev, [sessionId]: "" }));
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveManualAttendance(fd);
      if (res.error) { setRowErrors((prev) => ({ ...prev, [sessionId]: res.error! })); toast(res.error, "error"); return; }
      toast("Attendance saved");
      refresh();
    });
  }

  function handleCsvUpload(e: React.FormEvent<HTMLFormElement>, sessionId: string) {
    e.preventDefault();
    setRowErrors((prev) => ({ ...prev, [sessionId]: "" }));
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await uploadTeamsAttendanceCsv(fd);
      if (res.error) { setRowErrors((prev) => ({ ...prev, [sessionId]: res.error! })); toast(res.error, "error"); return; }
      toast("Attendance imported from CSV");
      const ref = teamsFileRefs.current[sessionId];
      if (ref) ref.value = "";
      refresh();
    });
  }

  function handleDelete(sessionId: string) {
    startTransition(async () => {
      const res = await deleteSession(sessionId, cohortId);
      if (res.error) { setRowErrors((prev) => ({ ...prev, [sessionId]: res.error! })); toast(res.error, "error"); }
      else toast("Session deleted");
      setConfirmDeleteId(null);
      refresh();
    });
  }

  function downloadTemplate(session: Session) {
    const lines = ["Full Name,Email,Duration (Minutes)"];
    for (const t of trainees) {
      const email = t.amalitech_email ?? t.personal_email;
      lines.push(`"${t.full_name}","${email}",`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `attendance_template_${session.week_number ?? ""}s${session.session_number ?? ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalSessions = sessions.length;
  const avgAttendance = (() => {
    if (!attendance.length) return null;
    const attended = attendance.filter((a) => a.status === "present" || a.status === "partial").length;
    const total    = attendance.length;
    return total > 0 ? Math.round((attended / total) * 100) : null;
  })();

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Attendance</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {trainees.length} trainee{trainees.length !== 1 ? "s" : ""}
            {totalSessions > 0 && (
              <> · {totalSessions} session{totalSessions !== 1 ? "s" : ""}
              {avgAttendance !== null && <> · {avgAttendance}% avg attendance</>}</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowZoomForm((v) => !v); setShowTeamsForm(false); }}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            Zoom CSV
          </button>
          <button
            onClick={() => { setShowTeamsForm((v) => !v); setShowZoomForm(false); }}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Teams Session
          </button>
        </div>
      </div>

      {/* ── Attendance thresholds ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-600">
              Present threshold: <span className="font-semibold text-slate-800">{presentPct}%</span>
            </span>
            <span className="text-xs text-slate-600">
              Partial threshold: <span className="font-semibold text-slate-800">{partialPct}%</span>
            </span>
          </div>
          {!editThresholds && (
            <button
              onClick={() => { setEditPresentPct(presentPct); setEditPartialPct(partialPct); setThresholdError(""); setEditThresholds(true); }}
              className="text-slate-400 hover:text-slate-700 transition-colors"
              title="Edit thresholds"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>

        {editThresholds && (
          <div className="mt-3 flex items-end gap-3 flex-wrap">
            <label className="block">
              <span className="text-[10px] font-medium text-slate-500 block mb-1">Present %</span>
              <input
                type="number"
                min={1}
                max={100}
                value={editPresentPct}
                onChange={(e) => setEditPresentPct(parseInt(e.target.value, 10) || 0)}
                className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium text-slate-500 block mb-1">Partial %</span>
              <input
                type="number"
                min={1}
                max={100}
                value={editPartialPct}
                onChange={(e) => setEditPartialPct(parseInt(e.target.value, 10) || 0)}
                className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
              />
            </label>
            <button
              onClick={() => {
                setThresholdError("");
                startTransition(async () => {
                  const res = await updateAttendanceThresholds(cohortId, editPresentPct, editPartialPct);
                  if (res.error) { setThresholdError(res.error); return; }
                  setEditThresholds(false);
                  refresh();
                });
              }}
              disabled={isPending}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditThresholds(false); setThresholdError(""); }}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              Cancel
            </button>
            {thresholdError && <p className="text-xs text-red-600 w-full">{thresholdError}</p>}
          </div>
        )}
      </div>

      {/* ── Zoom upload form ────────────────────────────────────────────────── */}
      {showZoomForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Upload Zoom Attendance Report</h3>
          <form onSubmit={handleZoomSubmit} className="space-y-4">
            <input type="hidden" name="cohort_id" value={cohortId} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 block">Week Number</span>
                <input
                  name="week_number"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 10"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 block">Session Number</span>
                <input
                  name="session_number"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 2"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 mb-1 block">Zoom CSV Report</span>
              <input
                ref={zoomFileRef}
                name="csv_file"
                type="file"
                accept=".csv"
                required
                className="w-full text-sm text-slate-600 file:mr-3 file:text-xs file:font-medium file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Download from Zoom → Reports → Usage → Meeting Attendee. Topic, date and duration are auto-parsed from the file.
              </p>
            </label>
            {zoomError && <p className="text-xs text-red-600">{zoomError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
              >
                {isPending ? "Uploading…" : "Upload & Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowZoomForm(false)}
                className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Teams session form ──────────────────────────────────────────────── */}
      {showTeamsForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Create Teams Session</h3>
          <form onSubmit={handleTeamsCreate} className="space-y-4">
            <input type="hidden" name="cohort_id" value={cohortId} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 block">Week Number</span>
                <input
                  name="week_number"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 10"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 block">Session Number</span>
                <input
                  name="session_number"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 1"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 mb-1 block">Session Topic</span>
              <input
                name="topic"
                type="text"
                required
                placeholder="e.g. WK10 — IAM & Policies"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 block">Date & Time</span>
                <input
                  name="started_at"
                  type="datetime-local"
                  required
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 block">Total Duration (min)</span>
                <input
                  name="total_duration_mins"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 180"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
            </div>
            {teamsError && <p className="text-xs text-red-600">{teamsError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
              >
                {isPending ? "Creating…" : "Create Session"}
              </button>
              <button
                type="button"
                onClick={() => setShowTeamsForm(false)}
                className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Sessions list ───────────────────────────────────────────────────── */}
      {sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">
            No sessions recorded yet. Upload a Zoom report or create a Teams session above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const stats      = sessionStats(session.id);
            const attMap     = attendanceBySession.get(session.id) ?? new Map<string, AttendanceRow>();
            const hasAtt     = attMap.size > 0;
            const isExpanded = expandedId === session.id;
            const rowError   = rowErrors[session.id] ?? "";
            const isZoom     = session.platform === "zoom";

            // Manual duration state for this session
            const sessionDurations = manualDurations[session.id] ?? {};

            return (
              <div key={session.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Session header */}
                <div className="px-5 py-3.5 flex items-center gap-3">
                  {/* Week·Session badge */}
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded tabular-nums flex-shrink-0">
                    W{session.week_number ?? "?"}·S{session.session_number ?? "?"}
                  </span>

                  {/* Platform */}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${isZoom ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                    {session.platform}
                  </span>

                  {/* Topic */}
                  <span className="text-sm font-medium text-slate-800 truncate flex-1">
                    {session.topic}
                  </span>

                  {/* Date & duration */}
                  <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:block">
                    {fmtDate(session.started_at)} · {session.total_duration_mins} min
                  </span>

                  {/* Attendance summary dots */}
                  {hasAtt && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(["present", "partial", "brief", "absent"] as const).map((s) =>
                        stats[s] > 0 ? (
                          <span key={s} className={`inline-flex items-center gap-1 text-[10px] font-medium ${STATUS_BADGE[s]} px-1.5 py-0.5 rounded`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                            {stats[s]}
                          </span>
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Expand / Collapse */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    className="text-xs text-slate-400 hover:text-slate-700 flex-shrink-0 ml-1"
                    title={isExpanded ? "Collapse" : "Show attendance"}
                  >
                    {isExpanded ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>

                  {/* Delete */}
                  {confirmDeleteId === session.id ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-slate-500">Delete?</span>
                      <button
                        onClick={() => handleDelete(session.id)}
                        disabled={isPending}
                        className="text-xs font-medium text-red-600 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-50"
                      >Yes</button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-50"
                      >No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(session.id)}
                      className="text-slate-300 hover:text-red-500 flex-shrink-0 transition-colors"
                      title="Delete session"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {rowError && (
                      <div className="px-5 py-2 bg-red-50 border-b border-red-100">
                        <p className="text-xs text-red-600">{rowError}</p>
                      </div>
                    )}

                    {/* ── Zoom: read-only attendance table ───────────────── */}
                    {isZoom && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Trainee</th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Duration</th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">%</th>
                              <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {trainees.map((t) => {
                              const row = attMap.get(t.id);
                              return (
                                <tr key={t.id} className="hover:bg-slate-50">
                                  <td className="px-5 py-2 text-sm text-slate-800">{t.full_name}</td>
                                  <td className="px-4 py-2 text-right text-sm tabular-nums text-slate-600">
                                    {row ? `${row.duration_mins} min` : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-500">
                                    {row ? `${Math.round(row.attendance_pct ?? 0)}%` : "—"}
                                  </td>
                                  <td className="px-5 py-2 text-right">
                                    {row ? (
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                                        {STATUS_LABEL[row.status] ?? row.status}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-300">Not recorded</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* ── Teams: manual entry + CSV upload ───────────────── */}
                    {!isZoom && (
                      <div className="p-5 space-y-5">

                        {/* CSV upload */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-slate-700">Upload Attendance CSV</h4>
                            <button
                              type="button"
                              onClick={() => downloadTemplate(session)}
                              className="text-[10px] font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download template
                            </button>
                          </div>
                          <form onSubmit={(e) => handleCsvUpload(e, session.id)} className="flex items-center gap-3">
                            <input type="hidden" name="cohort_id"  value={cohortId}  />
                            <input type="hidden" name="session_id" value={session.id} />
                            <input
                              ref={(el) => { teamsFileRefs.current[session.id] = el; }}
                              name="csv_file"
                              type="file"
                              accept=".csv"
                              required
                              className="flex-1 text-xs text-slate-600 file:mr-2 file:text-xs file:font-medium file:px-2.5 file:py-1 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                            />
                            <button
                              type="submit"
                              disabled={isPending}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white disabled:opacity-50 flex-shrink-0 transition-colors"
                            >
                              {isPending ? "…" : "Upload"}
                            </button>
                          </form>
                          <p className="text-[10px] text-slate-400 mt-1.5">
                            Columns: <span className="font-mono bg-slate-100 px-1 rounded">Full Name, Email, Duration (Minutes)</span>
                          </p>
                        </div>

                        {/* Manual entry table */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-2">
                            Or enter manually
                            {cohortLevel === "practitioner" && (
                              <span className="font-normal text-slate-400 ml-1">
                                (≥{presentPct}% = present · ≥{partialPct}% = partial)
                              </span>
                            )}
                            {cohortLevel !== "practitioner" && (
                              <span className="font-normal text-slate-400 ml-1">
                                (any duration &gt; 0 = present)
                              </span>
                            )}
                          </h4>
                          <form onSubmit={(e) => handleManualSave(e, session.id)}>
                            <input type="hidden" name="cohort_id"          value={cohortId}                     />
                            <input type="hidden" name="session_id"         value={session.id}                   />
                            <input type="hidden" name="total_duration_mins" value={session.total_duration_mins} />

                            <div className="rounded-xl border border-slate-200 overflow-hidden mb-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Trainee</th>
                                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Duration (min)</th>
                                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {trainees.map((t) => {
                                    const existing = attMap.get(t.id);
                                    const localVal = sessionDurations[t.id] ?? (existing?.duration_mins?.toString() ?? "0");
                                    const parsedDur = parseInt(localVal, 10);
                                    const liveStatus = isNaN(parsedDur)
                                      ? "absent"
                                      : clientStatus(parsedDur, session.total_duration_mins, cohortLevel === "practitioner", presentPct, partialPct);

                                    return (
                                      <tr key={t.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 text-sm text-slate-800">{t.full_name}</td>
                                        <td className="px-4 py-2 text-right">
                                          <input
                                            name={`duration_${t.id}`}
                                            type="number"
                                            min={0}
                                            max={session.total_duration_mins * 2}
                                            value={localVal}
                                            onChange={(e) =>
                                              setManualDurations((prev) => ({
                                                ...prev,
                                                [session.id]: { ...(prev[session.id] ?? {}), [t.id]: e.target.value },
                                              }))
                                            }
                                            className="w-20 text-right text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
                                          />
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[liveStatus]}`}>
                                            {STATUS_LABEL[liveStatus]}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <button
                              type="submit"
                              disabled={isPending}
                              className="text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
                            >
                              {isPending ? "Saving…" : "Save Attendance"}
                            </button>
                          </form>
                        </div>

                      </div>
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
