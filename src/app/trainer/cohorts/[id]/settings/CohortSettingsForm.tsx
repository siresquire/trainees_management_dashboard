"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCohortSettings } from "@/actions/cohorts";
import { toast } from "@/lib/toast";

type Cohort = {
  name:                  string;
  level:                 string;
  cohort_subtype:        string | null;
  start_date:            string;
  end_date:              string | null;
  exam_prep_weeks:       number;
  present_threshold_mins: number;
};

const SUBTYPE_OPTIONS = [
  { value: "university", label: "Practitioner - University" },
  { value: "external",   label: "Practitioner - External"  },
] as const;

export default function CohortSettingsForm({
  cohortId,
  cohort,
  isAdmin,
  universityMins,
  externalMins,
}: {
  cohortId:      string;
  cohort:        Cohort;
  isAdmin:       boolean;
  universityMins: number;
  externalMins:   number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name,         setName]         = useState(cohort.name);
  const [startDate,    setStartDate]    = useState(cohort.start_date);
  const [endDate,      setEndDate]      = useState(cohort.end_date ?? "");
  const [examPrepWeeks, setExamPrepWeeks] = useState(cohort.exam_prep_weeks);
  const [subtype,      setSubtype]      = useState(cohort.cohort_subtype ?? "");
  const [thresholdMins, setThresholdMins] = useState(cohort.present_threshold_mins);
  const [error,        setError]        = useState<string | null>(null);
  const [saved,        setSaved]        = useState(false);

  const isPractitioner = cohort.level === "practitioner";

  // When subtype changes, auto-update threshold mins if not admin-overridden
  function handleSubtypeChange(val: string) {
    setSubtype(val);
    if (!isAdmin) {
      if (val === "university") setThresholdMins(universityMins);
      if (val === "external")   setThresholdMins(externalMins);
    }
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateCohortSettings(cohortId, {
        name,
        start_date:           startDate,
        end_date:             endDate,
        exam_prep_weeks:      examPrepWeeks,
        cohort_subtype:       isPractitioner ? (subtype || null) : null,
        present_threshold_mins: isAdmin ? thresholdMins : undefined,
      });
      if (res.error) {
        setError(res.error);
        toast(res.error, "error");
      } else {
        setSaved(true);
        toast("Settings saved");
        router.refresh();
      }
    });
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";
  const readonlyCls = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-600 cursor-not-allowed";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}
      {saved && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">Settings saved successfully.</div>
      )}

      <Field label="Cohort name">
        <input
          type="text" required value={name} onChange={(e) => setName(e.target.value)}
          className={inputCls} placeholder="e.g. Class of Spring 2026"
        />
      </Field>

      {isPractitioner && (
        <Field label="Cohort subtype" hint={!subtype ? "Please select a subtype for this practitioner cohort" : undefined}>
          <select
            value={subtype} onChange={(e) => handleSubtypeChange(e.target.value)}
            className={inputCls}
          >
            <option value="">— Select subtype —</option>
            {SUBTYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {!subtype && (
            <p className="text-xs text-amber-600 mt-1 font-medium">Required: please select University or External</p>
          )}
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Start date">
          <input
            type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="End date">
          <input
            type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Exam prep weeks" hint="Weeks at the end of the cohort dedicated to exam preparation">
        <input
          type="number" min={0} max={6} value={examPrepWeeks}
          onChange={(e) => setExamPrepWeeks(Number(e.target.value))}
          className={inputCls}
        />
      </Field>

      {isPractitioner && (
        <Field
          label="Attendance threshold (present)"
          hint={isAdmin ? "Minimum minutes for a session to count as Present" : "Set by Admin — contact an admin to change this value"}
        >
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} value={thresholdMins}
                onChange={(e) => setThresholdMins(Number(e.target.value))}
                className="w-32 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <span className="text-sm text-slate-500">minutes</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={`${thresholdMins} min`} className={readonlyCls} style={{ width: "8rem" }} />
              <span className="text-xs text-slate-400">read-only</span>
            </div>
          )}
        </Field>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isPending || (isPractitioner && !subtype)}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Saving…" : "Save settings"}
        </button>
        {isPractitioner && !subtype && (
          <span className="text-xs text-amber-600">Select a subtype before saving</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
