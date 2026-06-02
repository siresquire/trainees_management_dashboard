"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import TaskDrawer, { type DrawerTask } from "./TaskDrawer";
import { deleteWeekTasks, deleteAllTasks } from "@/actions/tasks";

type Task = {
  id: string;
  task_name: string;
  task_type: string;
  completionCount: number;
};

const TYPE_BADGE: Record<string, string> = {
  kc:    "bg-blue-100 text-blue-700",
  lab:   "bg-emerald-100 text-emerald-700",
  video: "bg-purple-100 text-purple-700",
};

export default function TasksClient({
  weeks,
  byWeek,
  cohortId,
  totalTrainees,
}: {
  weeks: number[];
  byWeek: Record<number, Task[]>;
  cohortId: string;
  totalTrainees: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTask,        setActiveTask]        = useState<DrawerTask | null>(null);
  const [confirmDeleteWeek, setConfirmDeleteWeek] = useState<number | null>(null);
  const [confirmDeleteAll,  setConfirmDeleteAll]  = useState(false);
  const [deleteError,       setDeleteError]       = useState("");

  function refresh() { router.refresh(); }

  function handleDeleteWeek(week: number) {
    setDeleteError("");
    startTransition(async () => {
      const res = await deleteWeekTasks(cohortId, week);
      if (res.error) { setDeleteError(res.error); return; }
      setConfirmDeleteWeek(null);
      refresh();
    });
  }

  function handleDeleteAll() {
    setDeleteError("");
    startTransition(async () => {
      const res = await deleteAllTasks(cohortId);
      if (res.error) { setDeleteError(res.error); return; }
      setConfirmDeleteAll(false);
      refresh();
    });
  }

  const totalTaskCount = weeks.reduce((n, w) => n + (byWeek[w]?.length ?? 0), 0);

  return (
    <>
      {/* ── Delete-all bar ─────────────────────────────────────────────── */}
      {totalTaskCount > 0 && (
        <div className="flex items-center justify-between">
          <span />
          {confirmDeleteAll ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <p className="text-xs text-red-700 font-medium">
                Delete all {totalTaskCount} tasks? This also removes completion records.
              </p>
              <button
                onClick={handleDeleteAll}
                disabled={isPending}
                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Yes, delete all"}
              </button>
              <button
                onClick={() => setConfirmDeleteAll(false)}
                disabled={isPending}
                className="text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setConfirmDeleteAll(true); setDeleteError(""); }}
              className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete all tasks
            </button>
          )}
        </div>
      )}

      {deleteError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{deleteError}</p>
      )}

      {/* ── Week groups ────────────────────────────────────────────────── */}
      {weeks.map((week) => {
        const weekTasks = byWeek[week] ?? [];
        const isConfirmingWeek = confirmDeleteWeek === week;

        return (
          <div key={week} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Week {week}{week === 0 ? " (Orientation)" : ""}
              </h3>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {[
                    weekTasks.filter((t) => t.task_type === "kc").length    > 0 && `${weekTasks.filter((t) => t.task_type === "kc").length} KC`,
                    weekTasks.filter((t) => t.task_type === "lab").length   > 0 && `${weekTasks.filter((t) => t.task_type === "lab").length} Lab`,
                    weekTasks.filter((t) => t.task_type === "video").length > 0 && `${weekTasks.filter((t) => t.task_type === "video").length} Video`,
                  ].filter(Boolean).join(" · ")}
                </span>

                {/* Per-week delete */}
                {isConfirmingWeek ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-red-600 font-medium">Delete {weekTasks.length} tasks?</span>
                    <button
                      onClick={() => handleDeleteWeek(week)}
                      disabled={isPending}
                      className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isPending ? "…" : "Yes"}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteWeek(null)}
                      disabled={isPending}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setConfirmDeleteWeek(week); setConfirmDeleteAll(false); setDeleteError(""); }}
                    title={`Delete all Week ${week} tasks`}
                    className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {weekTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() =>
                    setActiveTask({
                      id: task.id,
                      name: task.task_name,
                      type: task.task_type as "kc" | "lab" | "video",
                      weekNumber: week,
                      cohortId,
                      totalTrainees,
                    })
                  }
                  className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 group text-left transition-colors"
                >
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md uppercase ${TYPE_BADGE[task.task_type] ?? "bg-slate-100 text-slate-600"}`}>
                    {task.task_type}
                  </span>
                  <span className="flex-1 text-sm text-slate-800">{task.task_name}</span>
                  {task.completionCount > 0 && (
                    <span className="text-xs text-slate-400">
                      {task.completionCount} completion{task.completionCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <TaskDrawer task={activeTask} onClose={() => setActiveTask(null)} />
    </>
  );
}
