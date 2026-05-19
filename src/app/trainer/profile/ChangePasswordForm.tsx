"use client";

import { useActionState } from "react";
import { changeMyPassword } from "@/actions/profile";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

export default function ChangePasswordForm() {
  const [state, action, isPending] = useActionState(changeMyPassword, null);

  if (state?.success) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Password updated successfully.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">New password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm new password</label>
        <input
          name="confirm_password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Repeat your new password"
          className={inputCls}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {isPending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
