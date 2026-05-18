"use client";

import { useActionState } from "react";
import { requestEmailChange } from "@/actions/profile";

export default function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, isPending] = useActionState(requestEmailChange, null);

  if (state?.success) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
        <p className="text-sm font-medium text-green-700">Request submitted</p>
        <p className="text-xs text-green-600 mt-0.5">
          Your email-change request has been sent to a Super Admin for review.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Current email</label>
        <p className="text-sm text-slate-400 italic">{currentEmail}</p>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1" htmlFor="requested_email">
          New email address
        </label>
        <input
          id="requested_email"
          name="requested_email"
          type="email"
          required
          placeholder="new@example.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1" htmlFor="reason">
          Reason for change
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          placeholder="e.g. Changed from personal email to Amalitech email…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>

      {state?.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isPending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
