"use client";

import { useActionState } from "react";
import { changeStaffEmailBySA } from "@/actions/profile";

export default function SAEmailForm({ targetId }: { targetId: string }) {
  const [state, action, isPending] = useActionState(changeStaffEmailBySA, null);

  if (state?.success) {
    return (
      <p className="text-sm text-green-600">Email updated successfully.</p>
    );
  }

  return (
    <form action={action} className="flex items-end gap-2 flex-wrap">
      <input type="hidden" name="target_id" value={targetId} />

      <div className="flex-1 min-w-48">
        <label className="block text-xs text-slate-500 mb-1" htmlFor="new_email">
          New email address
        </label>
        <input
          id="new_email"
          name="new_email"
          type="email"
          required
          placeholder="new@amalitech.org"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isPending ? "Updating…" : "Update email"}
      </button>

      {state?.error && (
        <p className="w-full text-xs text-red-600 mt-1">{state.error}</p>
      )}
    </form>
  );
}
