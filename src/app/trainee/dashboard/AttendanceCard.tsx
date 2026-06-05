"use client";

import { useState } from "react";

type Session = {
  id: string;
  week_number: number | null;
  session_number: number | null;
  topic: string | null;
  started_at: string;
  total_duration_mins: number;
};

type AttendanceRecord = {
  status: string;
  duration_mins: number;
};

type Props = {
  attended:       number;
  totalSessions:  number;
  overallAttPct:  number | null;
  sessions:       Session[];
  attendanceMap:  Record<string, AttendanceRecord>;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AttendanceCard({
  attended, totalSessions, overallAttPct, sessions, attendanceMap,
}: Props) {
  const [open, setOpen] = useState(false);

  const pct = overallAttPct !== null ? Math.round(overallAttPct) : null;
  const accent =
    pct === null   ? "text-slate-400" :
    pct >= 80      ? "text-green-600"  :
    pct >= 50      ? "text-amber-600"  : "text-red-500";

  return (
    <>
      {/* ── Stat card ────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-orange-300 hover:shadow-sm transition-all w-full"
      >
        <p className="text-xs text-slate-500 mb-1">Attendance</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">
          {totalSessions > 0 ? `${attended} / ${totalSessions}` : "—"}
        </p>
        <p className={`text-xs mt-0.5 ${accent}`}>
          {pct !== null
            ? `${pct}% sessions`
            : totalSessions === 0 ? "No sessions yet" : ""}
        </p>
        {totalSessions > 0 && (
          <p className="text-[10px] text-slate-400 mt-1">Tap for details</p>
        )}
      </button>

      {/* ── Side panel ───────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />

          {/* Pane */}
          <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">My Attendance</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {attended} of {totalSessions} session{totalSessions !== 1 ? "s" : ""} attended
                  {pct !== null && ` · ${pct}%`}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {sessions.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <p className="text-sm text-slate-400">No sessions recorded yet.</p>
                </div>
              ) : (
                sessions.map((s) => {
                  const rec    = attendanceMap[s.id];
                  const status = rec?.status ?? "absent";
                  const durMins = rec?.duration_mins ?? 0;
                  const isPresent = status === "present";

                  return (
                    <div key={s.id} className="px-5 py-3 flex items-start gap-3">
                      {/* Status dot */}
                      <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${isPresent ? "bg-green-500" : "bg-red-400"}`} />

                      <div className="flex-1 min-w-0">
                        {/* Topic / week label */}
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {s.topic ?? `Week ${s.week_number ?? "?"} Session ${s.session_number ?? ""}`}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDate(s.started_at)}</p>
                      </div>

                      <div className="text-right shrink-0">
                        {/* Present / Absent badge */}
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                          isPresent
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-600"
                        }`}>
                          {isPresent ? "Present" : "Absent"}
                        </span>
                        {/* Minutes */}
                        <p className="text-xs text-slate-400 mt-1">
                          {durMins} / {s.total_duration_mins} min
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
