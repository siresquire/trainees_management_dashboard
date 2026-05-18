"use client";

import { useTransition } from "react";
import { syncCohortFromCanvas, initFromTemplate } from "@/actions/canvas";
import { useState } from "react";

export function InitTemplateButton({ cohortId }: { cohortId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await initFromTemplate(cohortId);
            if ("error" in r) setResult(`Error: ${r.error}`);
            else setResult(`Done — ${r.inserted} task${r.inserted !== 1 ? "s" : ""} added.`);
          })
        }
        className="text-sm border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {isPending ? "Initializing…" : "Initialize from default template"}
      </button>
      {result && (
        <p className={`text-sm ${result.startsWith("Error") ? "text-red-600" : "text-green-700"}`}>
          {result}
        </p>
      )}
    </div>
  );
}

export function SyncButton({ cohortId }: { cohortId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    completions?: number;
    skipped?: number;
    warnings?: string[];
    error?: string;
  } | null>(null);

  return (
    <div className="space-y-3">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            const r = await syncCohortFromCanvas(cohortId);
            if ("error" in r) setResult({ error: r.error });
            else setResult({ completions: r.completions, skipped: r.skipped, warnings: r.warnings });
          })
        }
        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isPending ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Syncing…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync from Canvas
          </>
        )}
      </button>

      {result?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {result.error}
        </p>
      )}
      {result?.completions !== undefined && (
        <div className="text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
          <p className="text-green-700 font-medium">Sync complete</p>
          <p className="text-green-600">
            {result.completions} completion{result.completions !== 1 ? "s" : ""} upserted
            {result.skipped ? `, ${result.skipped} submissions skipped` : ""}
          </p>
          {result.warnings?.map((w, i) => (
            <p key={i} className={`text-xs ${w.toLowerCase().includes("error") ? "text-red-600" : "text-slate-500"}`}>
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
