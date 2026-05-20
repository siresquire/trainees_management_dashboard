"use client";

import { useState } from "react";

type Task = {
  id: string;
  week_number: number;
  task_name: string;
  task_type: string;
  display_order: number;
};

type Completion = {
  task_id: string;
  score: number | null;
  completed_at: string | null;
};

interface Props {
  tasks: Task[];
  completions: Completion[];
  weeks: number[];
}

export default function WeekProgress({ tasks, completions, weeks }: Props) {
  const [selectedWeek, setSelectedWeek] = useState(weeks[0] ?? 1);

  const completionMap = new Map(completions.map((c) => [c.task_id, c]));

  const weekTasks  = tasks.filter((t) => t.week_number === selectedWeek);
  const weekKcs    = weekTasks.filter((t) => t.task_type === "kc");
  const weekLabs   = weekTasks.filter((t) => t.task_type === "lab");
  const weekVideos = weekTasks.filter((t) => t.task_type === "video");

  return (
    <>
      {/* Week tabs */}
      <div className="px-4 md:px-6 pb-3 border-b border-slate-100">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {weeks.map((w) => (
            <button
              key={w}
              onClick={() => setSelectedWeek(w)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedWeek === w
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Week {w}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks for selected week */}
      {weekTasks.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          No tasks for Week {selectedWeek}.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {weekKcs.length > 0 && (
            <section className="px-4 md:px-6 py-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Knowledge Checks ({weekKcs.length})
              </h3>
              <div className="space-y-2">
                {weekKcs.map((task) => {
                  const comp = completionMap.get(task.id);
                  const score = comp?.score ?? null;
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                        {task.task_name}
                      </span>
                      {comp ? (
                        <span
                          className={`flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            score !== null && score >= 80
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {score !== null ? `${score}%` : "Submitted"}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-xs text-slate-400">Not done</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {weekLabs.length > 0 && (
            <section className="px-4 md:px-6 py-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Labs ({weekLabs.length})
              </h3>
              <div className="space-y-2">
                {weekLabs.map((task) => {
                  const done = completionMap.has(task.id);
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                        {task.task_name}
                      </span>
                      {done ? (
                        <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-green-600">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Done
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-xs text-slate-400">Pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {weekVideos.length > 0 && (
            <section className="px-4 md:px-6 py-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Videos ({weekVideos.length})
              </h3>
              <div className="space-y-2">
                {weekVideos.map((task) => {
                  const done = completionMap.has(task.id);
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                        {task.task_name}
                      </span>
                      {done ? (
                        <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-purple-600">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Watched
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-xs text-slate-400">Pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
