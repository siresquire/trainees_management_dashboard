"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteTask, updateTask } from "@/actions/tasks";

type Row = {
  trainee_id: string;
  full_name: string;
  serial_no: number | null;
  amalitech_email: string | null;
  score: number | null;
  completed_at: string | null;
  done: boolean;
};

export type DrawerTask = {
  id: string;
  name: string;
  type: "kc" | "lab" | "video";
  weekNumber: number;
  cohortId: string;
  totalTrainees: number;
};

type Mode = "view" | "edit" | "confirm-delete";

export default function TaskDrawer({
  task,
  onClose,
}: {
  task: DrawerTask | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit form state — synced from task when it opens
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"kc" | "lab" | "video">("lab");
  const [editWeek, setEditWeek] = useState(1);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Reset state when a new task is opened ────────────────────────────────
  useEffect(() => {
    if (!task) return;
    setEditName(task.name);
    setEditType(task.type);
    setEditWeek(task.weekNumber);
    setMode("view");
    setActionError(null);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus name input when edit mode opens
  useEffect(() => {
    if (mode === "edit") {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [mode]);

  // ── Fetch completion data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!task) return;
    setLoading(true);
    const supabase = createClient();

    (async () => {
      const { data: trainees } = await supabase
        .from("trainees")
        .select("id, full_name, serial_no, amalitech_email")
        .eq("cohort_id", task.cohortId)
        .eq("status", "active")
        .order("serial_no", { ascending: true, nullsFirst: false });

      const { data: completions } = await supabase
        .from("completions")
        .select("trainee_id, score, completed_at")
        .eq("task_id", task.id);

      const compMap = new Map(
        (completions ?? []).map((c) => [c.trainee_id, c])
      );

      const result: Row[] = (trainees ?? []).map((t) => {
        const comp = compMap.get(t.id);
        return {
          trainee_id:      t.id,
          full_name:       t.full_name,
          serial_no:       t.serial_no,
          amalitech_email: t.amalitech_email ?? null,
          score:           comp?.score ?? null,
          completed_at:    comp?.completed_at ?? null,
          done:            !!comp,
        };
      });

      if (task.type === "kc") {
        result.sort((a, b) => {
          if (a.done !== b.done) return a.done ? -1 : 1;
          return (b.score ?? -1) - (a.score ?? -1);
        });
      } else {
        result.sort((a, b) => {
          if (a.done !== b.done) return a.done ? -1 : 1;
          return (a.serial_no ?? 999) - (b.serial_no ?? 999);
        });
      }

      setRows(result);
      setLoading(false);
    })();
  }, [task]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "edit" || mode === "confirm-delete") {
          setMode("view");
          setActionError(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mode, onClose]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleSaveEdit() {
    if (!task || !editName.trim()) return;
    setActionError(null);
    startTransition(async () => {
      const result = await updateTask(task.id, task.cohortId, {
        task_name:   editName.trim(),
        task_type:   editType,
        week_number: editWeek,
      });
      if (result?.error) {
        setActionError(result.error);
      } else {
        router.refresh();
        setMode("view");
      }
    });
  }

  function handleDelete() {
    if (!task) return;
    setActionError(null);
    startTransition(async () => {
      const result = await deleteTask(task.id, task.cohortId);
      if (result?.error) {
        setActionError(result.error);
        setMode("view");
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  function downloadCSV() {
    if (!task) return;
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const hasEmail = rows.some((r) => r.amalitech_email);
    const header = ["#", "Trainee Name", ...(hasEmail ? ["Amalitech Email"] : []), "Status"].join(",");
    const body = rows.map((r) =>
      [
        r.serial_no ?? "",
        esc(r.full_name),
        ...(hasEmail ? [r.amalitech_email ?? ""] : []),
        r.done ? "Completed" : "Pending",
      ].join(",")
    );
    const csv = [header, ...body].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Week${task.weekNumber}_${task.name.replace(/[^a-z0-9]/gi, "_").slice(0, 50)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!task) return null;

  const done = rows.filter((r) => r.done).length;
  const completionCount = rows.filter((r) => r.done).length;

  const TYPE_BADGE: Record<string, string> = {
    kc:    "bg-blue-100 text-blue-700",
    lab:   "bg-emerald-100 text-emerald-700",
    video: "bg-purple-100 text-purple-700",
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md uppercase ${TYPE_BADGE[task.type] ?? "bg-slate-100 text-slate-600"}`}>
                {task.type}
              </span>
              <span className="text-xs text-slate-400">
                Week {task.weekNumber} · {done} / {rows.length} done
              </span>
            </div>
            <h2 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
              {task.name}
            </h2>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Edit button */}
            {mode === "view" && (
              <button
                onClick={() => { setMode("edit"); setActionError(null); }}
                title="Edit task"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}

            {/* Delete button */}
            {mode === "view" && (
              <button
                onClick={() => { setMode("confirm-delete"); setActionError(null); }}
                title="Delete task"
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}

            {/* Download CSV button */}
            {mode === "view" && !loading && rows.length > 0 && (
              <button
                onClick={downloadCSV}
                title="Download CSV"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Edit mode ────────────────────────────────────────────── */}
          {mode === "edit" && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Edit task details. Changes apply immediately.</p>

              {/* Task name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="edit-task-name">
                  Task name
                </label>
                <input
                  id="edit-task-name"
                  ref={nameInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Task name"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="edit-task-type">
                  Type
                </label>
                <select
                  id="edit-task-type"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as "kc" | "lab" | "video")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="lab">Lab</option>
                  <option value="kc">Knowledge Check (KC)</option>
                  <option value="video">Video</option>
                </select>
              </div>

              {/* Week */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="edit-task-week">
                  Week
                </label>
                <input
                  id="edit-task-week"
                  type="number"
                  min={0}
                  max={52}
                  value={editWeek}
                  onChange={(e) => setEditWeek(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-slate-400 mt-1">Use 0 for orientation week.</p>
              </div>

              {actionError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {actionError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveEdit}
                  disabled={isPending || !editName.trim()}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {isPending ? "Saving…" : "Save changes"}
                </button>
                <button
                  onClick={() => { setMode("view"); setActionError(null); setEditName(task.name); setEditType(task.type); setEditWeek(task.weekNumber); }}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Delete confirmation ──────────────────────────────────── */}
          {mode === "confirm-delete" && (
            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <p className="text-sm font-medium text-red-800 mb-1">Delete this task?</p>
                <p className="text-xs text-red-700">
                  <span className="font-medium">{task.name}</span>
                  {" "}will be permanently removed from Week {task.weekNumber}.
                </p>
                {completionCount > 0 && (
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    ⚠ This task has {completionCount} completion record{completionCount !== 1 ? "s" : ""}.
                    Deleting it will also remove those records.
                  </p>
                )}
              </div>

              {actionError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {actionError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {isPending ? "Deleting…" : "Yes, delete task"}
                </button>
                <button
                  onClick={() => { setMode("view"); setActionError(null); }}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Completion table (view mode) ─────────────────────────── */}
          {mode === "view" && (
            loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 w-8">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Name</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">
                      {task.type === "kc" ? "Score" : "Status"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row) => (
                    <tr key={row.trainee_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs text-slate-400">{row.serial_no ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-800">{row.full_name}</td>
                      <td className="px-4 py-2.5 text-right">
                        {task.type === "kc" ? (
                          row.done ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(row.score ?? 0) >= 80 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {row.score !== null ? `${row.score}%` : "—"}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not done</span>
                          )
                        ) : (
                          row.done ? (
                            <span className="text-xs font-medium text-green-600 flex items-center justify-end gap-1">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Done
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Pending</span>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </>
  );
}
