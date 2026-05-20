"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addSingleTrainee } from "@/actions/trainees";
import { toast } from "@/lib/toast";

export default function AddTraineeForm({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(addSingleTrainee, null);
  const prevState = useRef(state);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (!state) return;
    if (state.error) {
      toast(state.error, "error");
    } else if (state.inserted) {
      toast("Trainee added successfully");
      setOpen(false);
    }
  }, [state]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700 border border-orange-200 hover:border-orange-400 bg-orange-50 hover:bg-orange-100 px-4 py-2 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Add trainee
      </button>

      {open && (
        <form action={action} className="mt-4 space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <input type="hidden" name="cohort_id" value={cohortId} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full name <span className="text-red-500">*</span></label>
              <input
                name="full_name"
                required
                placeholder="e.g. Kwame Mensah"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Personal email <span className="text-red-500">*</span></label>
              <input
                name="personal_email"
                type="email"
                required
                placeholder="e.g. kwame@gmail.com"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Amalitech email <span className="text-slate-400">(optional)</span></label>
              <input
                name="amalitech_email"
                type="email"
                placeholder="e.g. kwame.mensah@amalitech.org"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>
          </div>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {isPending ? "Adding…" : "Add trainee"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
