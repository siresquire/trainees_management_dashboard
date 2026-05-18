"use client";

import { useState, useTransition } from "react";
import { updateCohortExamType } from "@/actions/cohorts";
import { toast } from "@/lib/toast";

const OPTIONS: Record<string, { value: string; short: string }[]> = {
  associate: [
    { value: "SAA-C03", short: "SAA-C03" },
    { value: "DVA-C02", short: "DVA-C02" },
  ],
  devops: [
    { value: "SAP-C02", short: "SAP-C02" },
    { value: "DOP-C02", short: "DOP-C02" },
  ],
};

export default function ExamTypeForm({
  cohortId,
  level,
  current,
}: {
  cohortId: string;
  level: string;
  current: string | null;
}) {
  const options = OPTIONS[level];
  if (!options) return null;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave(newValue: string) {
    setValue(newValue);
    startTransition(async () => {
      const result = await updateCohortExamType(cohortId, newValue || null);
      if (result.error) {
        toast(result.error, "error");
      } else {
        setEditing(false);
        toast("Target exam updated");
      }
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <select
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-xs border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">— none —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.short}</option>
          ))}
        </select>
        <button
          onClick={() => handleSave(value)}
          disabled={isPending}
          className="text-xs text-white bg-orange-500 hover:bg-orange-600 rounded px-2 py-0.5 disabled:opacity-50"
        >
          {isPending ? "…" : "Save"}
        </button>
        <button
          onClick={() => { setValue(current ?? ""); setEditing(false); }}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors group"
      title="Set target exam type"
    >
      {current ? (
        <>
          <span className="font-mono bg-slate-100 text-slate-600 group-hover:bg-orange-50 group-hover:text-orange-700 px-1.5 py-0.5 rounded text-xs transition-colors">
            {current}
          </span>
          <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Set target exam</span>
        </>
      )}
    </button>
  );
}
