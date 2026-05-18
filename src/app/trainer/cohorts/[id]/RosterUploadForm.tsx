"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadRoster } from "@/actions/trainees";
import { toast } from "@/lib/toast";

export default function RosterUploadForm({
  cohortId,
  level,
  hasIndexNumbers = false,
}: {
  cohortId: string;
  level: string;
  hasIndexNumbers?: boolean;
}) {
  const [state, action, isPending] = useActionState(uploadRoster, null);

  // Fire a toast each time the action resolves (state reference changes).
  const prevState = useRef(state);
  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (!state) return;
    if (state.error) {
      toast(state.error, "error");
    } else if (state.inserted !== undefined) {
      const parts = [
        `${state.inserted} trainee${state.inserted !== 1 ? "s" : ""} added`,
        state.skipped  ? `${state.skipped} skipped`                                           : "",
        state.invited  ? `${state.invited} invite${state.invited !== 1 ? "s" : ""} sent`     : "",
      ].filter(Boolean).join(", ");
      toast(`Roster uploaded — ${parts}`);
    }
  }, [state]);

  const templateUrl = `/api/templates/roster?level=${level}${hasIndexNumbers ? "&has_index_numbers=1" : ""}`;

  return (
    <div className="space-y-4">
      {/* Download template */}
      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-900">Download the Excel template</p>
          <p className="text-xs text-blue-600">
            Fill it in, then upload below.
            {hasIndexNumbers && " Includes Index Number column."}
          </p>
        </div>
        <a
          href={templateUrl}
          download
          className="flex-shrink-0 text-sm font-medium text-blue-700 hover:text-blue-900 border border-blue-300 hover:border-blue-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          Download .xlsx
        </a>
      </div>

      {/* Upload form */}
      <form action={action} encType="multipart/form-data" className="space-y-3">
        <input type="hidden" name="cohort_id" value={cohortId} />

        <div className="flex items-center gap-4 flex-wrap">
          <input
            name="roster_file"
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            required
            className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 file:cursor-pointer"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" name="send_invites" value="1" className="rounded" />
            Send invite emails
          </label>
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        {state?.inserted !== undefined && (
          <div className="text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
            <p className="text-green-700 font-medium">Upload complete</p>
            <p className="text-green-600">
              {state.inserted} trainee{state.inserted !== 1 ? "s" : ""} added
              {state.skipped ? `, ${state.skipped} skipped` : ""}
              {state.invited ? `, ${state.invited} invite${state.invited !== 1 ? "s" : ""} sent` : ""}
            </p>
            {state.inviteErrors?.map((e, i) => (
              <p key={i} className="text-xs text-amber-700">{e}</p>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Uploading…" : "Upload roster"}
        </button>
      </form>
    </div>
  );
}
