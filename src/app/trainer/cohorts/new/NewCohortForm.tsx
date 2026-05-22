"use client";

import { useActionState, useState } from "react";
import { createCohort } from "@/actions/cohorts";
import Link from "next/link";

type StaffMember = { id: string; full_name: string; role: string };

const LEVEL_OPTIONS = [
  { key: "practitioner_university", label: "Practitioner - University", level: "practitioner", subtype: "university" },
  { key: "practitioner_external",   label: "Practitioner - External",   level: "practitioner", subtype: "external"   },
  { key: "associate",               label: "Associate",                 level: "associate",    subtype: ""           },
  { key: "devops",                  label: "NSPs cohort",               level: "devops",       subtype: ""           },
] as const;

type LevelKey = typeof LEVEL_OPTIONS[number]["key"];

const EXAM_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  associate: [
    { value: "SAA-C03", label: "SAA-C03 (Solutions Architect Associate)" },
    { value: "DVA-C02", label: "DVA-C02 (Developer Associate)" },
  ],
  devops: [
    { value: "SAP-C02", label: "SAP-C02 (Solutions Architect Professional)" },
    { value: "DOP-C02", label: "DOP-C02 (DevOps Engineer Professional)" },
  ],
};

export default function NewCohortForm({
  backHref = "/trainer/dashboard",
  assignableStaff,
  role = "trainer",
  universityMins = 45,
  externalMins   = 60,
}: {
  backHref?:        string;
  assignableStaff?: StaffMember[];
  role?:            string;
  universityMins?:  number;
  externalMins?:    number;
}) {
  const [state, action, isPending] = useActionState(createCohort, null);
  const [selectedLevelKey, setSelectedLevelKey] = useState<LevelKey | "">("");
  const showAssign = assignableStaff && assignableStaff.length > 0;
  const isQC = role === "quiz_creator";

  const selectedOption = LEVEL_OPTIONS.find((o) => o.key === selectedLevelKey);
  const examTypeOptions = selectedOption ? (EXAM_TYPE_OPTIONS[selectedOption.level] ?? null) : null;
  const isPractitioner  = selectedOption?.level === "practitioner";
  const thresholdMins   = selectedLevelKey === "practitioner_university" ? universityMins
                        : selectedLevelKey === "practitioner_external"   ? externalMins
                        : null;

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

            {/* Level select — combined key drives hidden level + subtype inputs */}
            <Field label="Training level" name="_level_key" error={state?.errors?.level?.[0]}>
              <select
                required
                className={inputCls}
                value={selectedLevelKey}
                onChange={(e) => setSelectedLevelKey(e.target.value as LevelKey)}
              >
                <option value="" disabled>Select level…</option>
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </Field>
            {/* Actual values submitted to the action */}
            <input type="hidden" name="level"          value={selectedOption?.level   ?? ""} />
            <input type="hidden" name="cohort_subtype" value={selectedOption?.subtype ?? ""} />

            {examTypeOptions && (
              <Field
                label="Target exam"
                name="exam_type"
                hint="Which AWS certification exam this cohort is preparing for"
                error={state?.errors?.exam_type?.[0]}
              >
                <select name="exam_type" required className={inputCls} defaultValue="">
                  <option value="" disabled>Select exam…</option>
                  {examTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Start date" name="start_date" error={state?.errors?.start_date?.[0]}>
                <input name="start_date" type="date" required className={inputCls} />
              </Field>
              <Field label="End date" name="end_date" error={state?.errors?.end_date?.[0]}>
                <input name="end_date" type="date" required className={inputCls} />
              </Field>
            </div>

            <Field label="Exam prep weeks" name="exam_prep_weeks" error={state?.errors?.exam_prep_weeks?.[0]} hint="Weeks at the end of the cohort dedicated to exam preparation">
              <input name="exam_prep_weeks" type="number" min={0} max={6} defaultValue={2} required className={inputCls} />
            </Field>

            {/* Attendance threshold — read-only, auto-populated from admin settings */}
            {isPractitioner && thresholdMins !== null && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                <p className="text-sm font-medium text-slate-700 mb-1">Attendance threshold</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-900">{thresholdMins} min</span>
                  <span className="text-xs text-slate-400">required to count as "Present"</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Set by Admin — applies to all {selectedLevelKey === "practitioner_university" ? "University" : "External"} cohorts</p>
              </div>
            )}
            {/* Hidden threshold inputs consumed by the action */}
            {isPractitioner && thresholdMins !== null && (
              <input type="hidden" name="present_threshold_mins" value={thresholdMins} />
            )}
            {/* Legacy % fields kept as hidden defaults; attendance processing will be updated separately */}
            <input type="hidden" name="attendance_present_pct" value="75" />
            <input type="hidden" name="attendance_partial_pct" value="50" />

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
