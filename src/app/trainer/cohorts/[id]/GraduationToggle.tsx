"use client";

import { useState, useTransition } from "react";
import { toggleGraduation } from "@/actions/trainees";
import { toast } from "@/lib/toast";

export default function GraduationToggle({
  traineeId,
  graduated,
}: {
  traineeId: string;
  graduated: boolean;
}) {
  const [optimistic, setOptimistic] = useState(graduated);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    startTransition(async () => {
      const result = await toggleGraduation(traineeId, next);
      if (result.error) {
        setOptimistic(!next);
        setError(result.error);
        toast(result.error, "error");
      } else {
        toast(next ? "Marked as graduated" : "Graduation removed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          optimistic ? "bg-green-500" : "bg-slate-200"
        } ${isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        title={optimistic ? "Mark as not graduated" : "Mark as graduated"}
        aria-label="Toggle graduation"
        aria-checked={optimistic}
        role="switch"
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            optimistic ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span
        className={`text-xs font-medium ${optimistic ? "text-green-600" : "text-slate-400"}`}
      >
        {optimistic ? "Graduated" : "Not yet"}
      </span>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
