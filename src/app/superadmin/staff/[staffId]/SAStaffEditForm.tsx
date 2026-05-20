"use client";

import { useActionState } from "react";
import { updateStaffProfileBySA } from "@/actions/profile";

export default function SAStaffEditForm({
  targetId,
  fullName,
  role,
  isActive,
}: {
  targetId: string;
  fullName: string;
  role: "trainer" | "quiz_creator" | "admin";
  isActive: boolean;
}) {
  const [state, action, isPending] = useActionState(updateStaffProfileBySA, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="target_id" value={targetId} />

      <div>
        <label className="block text-xs text-slate-500 mb-1" htmlFor="full_name">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={fullName}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Role</label>
        <select
          name="role"
          defaultValue={role}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="trainer">Trainer</option>
          <option value="quiz_creator">Quiz Creator</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Account status</label>
        <select
          name="is_active"
          defaultValue={isActive ? "true" : "false"}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {state?.success && <span className="text-sm text-green-600">Saved.</span>}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
