"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { syncCohortFromCanvas } from "@/actions/canvas";

export default function RefreshButton({ cohortId }: { cohortId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      setStatus(null);

      if (cohortId) {
        const r = await syncCohortFromCanvas(cohortId);
        if ("error" in r) {
          setStatus(`Sync error: ${r.error}`);
        } else {
          const parts: string[] = [];
          if (r.completions)  parts.push(`${r.completions} completions`);
          if (r.newTrainees)  parts.push(`${r.newTrainees} new trainees`);
          setStatus(parts.length ? `Synced — ${parts.join(", ")}` : "Already up to date");
          setTimeout(() => setStatus(null), 5000);
        }
      }

      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50 transition-colors"
        title={cohortId ? "Sync from Canvas and refresh" : "Refresh page data"}
      >
        <svg
          className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {isPending ? "Syncing…" : "Refresh"}
      </button>
      {status && (
        <span className={`text-xs ${status.startsWith("Sync error") ? "text-red-500" : "text-green-600"}`}>
          {status}
        </span>
      )}
    </div>
  );
}
