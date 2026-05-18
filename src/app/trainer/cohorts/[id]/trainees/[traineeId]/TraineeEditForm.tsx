"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateTraineeDetails } from "@/actions/trainees";

type Trainee = {
  id: string;
  full_name: string;
  personal_email: string;
  amalitech_email: string | null;
  phone: string | null;
  gender: string | null;
  town: string | null;
  region: string | null;
  university: string | null;
  serial_no: number | null;
};

const GHANA_REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Eastern", "Central",
  "Northern", "Upper East", "Upper West", "Volta", "Brong-Ahafo",
  "Bono", "Bono East", "Ahafo", "Savannah", "North East",
  "Oti", "Western North",
];

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

export default function TraineeEditForm({
  trainee,
  cohortId,
}: {
  trainee: Trainee;
  cohortId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(updateTraineeDetails, null);

  // Close the form on success
  if (state?.success && open) setOpen(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-orange-600 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Edit details
      </button>

      {open && (
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Edit trainee details</h3>

          <form action={action} className="space-y-3">
            <input type="hidden" name="cohort_id"  value={cohortId} />
            <input type="hidden" name="trainee_id" value={trainee.id} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full name" error={state?.errors?.full_name?.[0]}>
                <input name="full_name" type="text" required defaultValue={trainee.full_name} className={inputCls} />
              </Field>
              <Field label="Serial no." error={state?.errors?.serial_no?.[0]}>
                <input name="serial_no" type="number" min={1} defaultValue={trainee.serial_no ?? ""} className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Personal email" error={state?.errors?.personal_email?.[0]}>
                <input name="personal_email" type="email" required defaultValue={trainee.personal_email} className={inputCls} />
              </Field>
              <Field label="Amalitech email" error={state?.errors?.amalitech_email?.[0]}>
                <input name="amalitech_email" type="email" defaultValue={trainee.amalitech_email ?? ""} placeholder="Optional" className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Phone number" error={state?.errors?.phone?.[0]}>
                <input name="phone" type="tel" defaultValue={trainee.phone ?? ""} placeholder="+233 XX XXX XXXX" className={inputCls} />
              </Field>
              <Field label="Gender">
                <select name="gender" defaultValue={trainee.gender ?? ""} className={inputCls}>
                  <option value="">— Select —</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Town / City">
                <input name="town" type="text" defaultValue={trainee.town ?? ""} className={inputCls} />
              </Field>
              <Field label="Region">
                <select name="region" defaultValue={trainee.region ?? ""} className={inputCls}>
                  <option value="">— Select region —</option>
                  {GHANA_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="University / Institution">
              <input name="university" type="text" defaultValue={trainee.university ?? ""} className={inputCls} />
            </Field>

            {state?.error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {state.error}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                {isPending ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
