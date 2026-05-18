"use client";

import { useActionState, useRef } from "react";
import { bulkImportAssociateTasks } from "@/actions/tasks";

export default function AssociateTaskTools({ cohortId }: { cohortId: string }) {
  const [state, action, isPending] = useActionState(bulkImportAssociateTasks, null);
  const fileRef = useRef<HTMLInputElement>(null);

  const success = state && !state.error && state.inserted !== undefined;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Bulk import tasks</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Download the template, fill in your task list, then upload it here.
          </p>
        </div>
        <a
          href="/api/templates/associate-tasks"
          download
          className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-200 hover:border-orange-300 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download template
        </a>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="cohort_id" value={cohortId} />

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Upload filled template (.xlsx)
          </label>
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? "Importing…" : "Import tasks"}
          </button>
          <p className="text-xs text-slate-400">
            Duplicate task names within the same week are skipped automatically.
          </p>
        </div>
      </form>

      {/* Result feedback */}
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-1">
          <p className="text-sm font-medium text-red-700">{state.error}</p>
          {(state.warnings ?? []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {state.warnings!.map((w, i) => (
                <li key={i} className="text-xs text-red-600">{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-1">
          <p className="text-sm font-medium text-green-700">
            Import complete — {state.inserted} task{state.inserted !== 1 ? "s" : ""} added
            {state.skipped ? `, ${state.skipped} skipped` : ""}.
          </p>
          {(state.warnings ?? []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {state.warnings!.map((w, i) => (
                <li key={i} className="text-xs text-amber-700">{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
