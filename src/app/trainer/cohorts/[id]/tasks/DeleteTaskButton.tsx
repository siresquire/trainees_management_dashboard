"use client";

import { useTransition } from "react";
import { deleteTask } from "@/actions/tasks";

export default function DeleteTaskButton({
  taskId,
  cohortId,
}: {
  taskId: string;
  cohortId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await deleteTask(taskId, cohortId); })}
      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 p-1"
      title="Remove task"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}
