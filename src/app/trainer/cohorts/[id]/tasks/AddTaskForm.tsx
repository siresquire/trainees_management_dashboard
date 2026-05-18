"use client";

import { useActionState } from "react";
import { addTask } from "@/actions/tasks";

export default function AddTaskForm({
  cohortId,
  defaultWeek,
}: {
  cohortId: string;
  defaultWeek?: number;
}) {
  const [state, action, isPending] = useActionState(addTask, null);

  return (
    <form action={action} className="flex items-end gap-2 flex-wrap">
      <input type="hidden" name="cohort_id" value={cohortId} />

      <div>
        <label className="block text-xs text-slate-500 mb-1">Week</label>
        <input
          name="week_number"
          type="number"
          min={0}
          max={52}
          defaultValue={defaultWeek ?? 1}
          required
          className="w-16 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div className="flex-1 min-w-48">
        <label className="block text-xs text-slate-500 mb-1">Task name</label>
        <input
          name="task_name"
          type="text"
          required
          placeholder="e.g. KC - Cloud Concepts"
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Type</label>
        <select
          name="task_type"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="kc">KC</option>
          <option value="lab">Lab</option>
          <option value="video">Video</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
      >
        {isPending ? "Adding…" : "Add task"}
      </button>

      {state?.error && (
        <p className="w-full text-xs text-red-600 mt-1">{state.error}</p>
      )}
    </form>
  );
}
