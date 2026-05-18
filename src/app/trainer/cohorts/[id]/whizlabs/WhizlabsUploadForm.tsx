"use client";

import { useActionState, useRef } from "react";
import { uploadWhizlabs } from "@/actions/whizlabs";

export default function WhizlabsUploadForm({ cohortId }: { cohortId: string }) {
  const [state, action, isPending] = useActionState(uploadWhizlabs, null);
  const fileRef = useRef<HTMLInputElement>(null);

  const success = !state?.error && state?.matched !== undefined;

  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={() => {
        // reset file input after submit so the same file can be re-uploaded
        if (success && fileRef.current) fileRef.current.value = "";
      }}
    >
      <input type="hidden" name="cohort_id" value={cohortId} />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Whizlabs export file
        </label>
        <input
          ref={fileRef}
          type="file"
          name="whizlabs_file"
          accept=".csv,.xlsx,.xls"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
        />
        <p className="text-xs text-slate-400 mt-1.5">
          CSV or Excel. Required columns:{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">Email</code> (or Username) and{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">Lab Title</code> (or Lab Name).
        </p>
      </div>

      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-1">
          <p>{state.error}</p>
          {state.warnings?.map((w, i) => (
            <p key={i} className="text-xs text-red-500 font-mono">{w}</p>
          ))}
        </div>
      )}

      {success && (
        <div className="text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-green-700 font-medium">
            ✓ {state.matched} completion{state.matched !== 1 ? "s" : ""} recorded
          </p>
          {(state.skipped ?? 0) > 0 && (
            <p className="text-slate-500 text-xs">
              {state.skipped} row{state.skipped !== 1 ? "s" : ""} skipped — no matching trainee or lab task
            </p>
          )}
          {state.warnings?.map((w, i) => (
            <p key={i} className="text-xs text-amber-600">{w}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
      >
        {isPending ? "Processing…" : "Upload completions"}
      </button>
    </form>
  );
}
