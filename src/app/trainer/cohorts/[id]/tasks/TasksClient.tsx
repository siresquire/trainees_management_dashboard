"use client";

import { useState } from "react";
import TaskDrawer, { type DrawerTask } from "./TaskDrawer";

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
  const [activeTask, setActiveTask] = useState<DrawerTask | null>(null);

  return (
    <>
      {weeks.map((week) => {
        const weekTasks = byWeek[week] ?? [];
        return (
          <div key={week} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Week {week}{week === 0 ? " (Orientation)" : ""}
              </h3>
              <span className="text-xs text-slate-400">
                {[
                  weekTasks.filter((t) => t.task_type === "kc").length    > 0 && `${weekTasks.filter((t) => t.task_type === "kc").length} KC`,
                  weekTasks.filter((t) => t.task_type === "lab").length   > 0 && `${weekTasks.filter((t) => t.task_type === "lab").length} Lab`,
                  weekTasks.filter((t) => t.task_type === "video").length > 0 && `${weekTasks.filter((t) => t.task_type === "video").length} Video`,
                ].filter(Boolean).join(" · ")}
              </span>
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
