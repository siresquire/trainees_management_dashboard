"use client";

import { useActionState } from "react";
import { createCohort } from "@/actions/cohorts";
import Link from "next/link";

type StaffMember = { id: string; full_name: string; role: string };

export default function NewCohortForm({
  backHref = "/trainer/dashboard",
  assignableStaff,
  role = "trainer",
}: {
  backHref?: string;
  assignableStaff?: StaffMember[];
  role?: string;
}) {
  const [state, action, isPending] = useActionState(createCohort, null);
  const showAssign = assignableStaff && assignableStaff.length > 0;
  const isQC = role === "quiz_creator";

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Create cohort</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isQC ? "Set up a new quiz cohort for your institution" : "Set up a new training cohort"}
        </p>
      </div>

      {state?.error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      <form action={action} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">

        {/* Assign to trainer (super admin only) */}
        {showAssign && (
          <Field label="Assign to" name="assigned_trainer_id" hint="The trainer who will own and manage this cohort">
            <select name="assigned_trainer_id" className={inputCls} defaultValue="">
              <option value="">— Select trainer —</option>
              {assignableStaff!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.role.replace("_", " ")})
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Cohort name — always shown */}
        <Field label="Cohort name" name="name" error={state?.errors?.name?.[0]}>
          <input name="name" type="text" required placeholder="e.g. Class of Spring 2026" className={inputCls} />
        </Field>

        {/* Institution — required for QC, optional for trainer */}
        <Field
          label={isQC ? "School / Institution name" : "School / Institution name (optional)"}
          name="institution"
          error={state?.errors?.institution?.[0]}
          hint={isQC ? "The university or organisation this cohort belongs to" : undefined}
        >
          <input
            name="institution"
            type="text"
            required={isQC}
            placeholder="e.g. University of Ghana"
            className={inputCls}
          />
        </Field>

        {/* ── Quiz Creator: simplified fields ─────────────────────────────── */}
        {isQC && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Start date" name="start_date" error={state?.errors?.start_date?.[0]}>
                <input name="start_date" type="date" required className={inputCls} />
              </Field>
              <Field label="End date" name="end_date" error={state?.errors?.end_date?.[0]}>
                <input name="end_date" type="date" required className={inputCls} />
              </Field>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name="has_index_numbers"
                value="1"
                className="mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Track by index / matriculation number</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Adds an Index Number column to the roster. Useful when students have a matriculation or student ID.
                </p>
              </div>
            </label>
          </>
        )}

        {/* ── Trainer / Admin: full fields ─────────────────────────────────── */}
        {!isQC && (
          <>
            <Field label="Code name (login identifier)" name="code_name" hint="Short label trainees see in the login dropdown — e.g. GHACC62. Defaults to cohort name if left blank.">
              <input name="code_name" type="text" placeholder="e.g. GHACC62" className={inputCls} />
            </Field>

            <Field label="Training level" name="level" error={state?.errors?.level?.[0]}>
              <select name="level" required className={inputCls} defaultValue="">
                <option value="" disabled>Select level…</option>
                <option value="practitioner">Practitioner (Canvas)</option>
                <option value="associate">Associate (Whizlabs)</option>
                <option value="devops">DevOps NSP</option>
              </select>
            </Field>

            <Field label="Start date" name="start_date" error={state?.errors?.start_date?.[0]}>
              <input name="start_date" type="date" required className={inputCls} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Training weeks" name="training_weeks" error={state?.errors?.training_weeks?.[0]}>
                <input name="training_weeks" type="number" min={1} max={52} defaultValue={9} required className={inputCls} />
              </Field>
              <Field label="Exam prep weeks" name="exam_prep_weeks" error={state?.errors?.exam_prep_weeks?.[0]}>
                <input name="exam_prep_weeks" type="number" min={0} max={6} defaultValue={2} required className={inputCls} />
              </Field>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Attendance thresholds</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Present threshold (%)" name="attendance_present_pct" error={state?.errors?.attendance_present_pct?.[0]} hint="≥ this = present (green)">
                  <input name="attendance_present_pct" type="number" min={1} max={100} defaultValue={75} required className={inputCls} />
                </Field>
                <Field label="Partial threshold (%)" name="attendance_partial_pct" error={state?.errors?.attendance_partial_pct?.[0]} hint="≥ this = partial (amber)">
                  <input name="attendance_partial_pct" type="number" min={1} max={100} defaultValue={50} required className={inputCls} />
                </Field>
              </div>
            </div>

            <Field label="Canvas Course ID" name="canvas_course_id" hint="Required for Practitioner cohorts">
              <input name="canvas_course_id" type="text" placeholder="e.g. 4166" className={inputCls} />
            </Field>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name="has_index_numbers"
                value="1"
                className="mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Track by index / matriculation number</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Adds an Index Number column to the roster. Useful for university cohorts where students have a matriculation or student ID.
                </p>
              </div>
            </label>
          </>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href={backHref} className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {isPending ? "Creating…" : "Create cohort"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

function Field({ label, name, error, hint, children }: {
  label: string; name: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
