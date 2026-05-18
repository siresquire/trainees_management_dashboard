"use client";

import { useState, useTransition } from "react";
import { updateCohortCodeName } from "@/actions/cohorts";
import { toast } from "@/lib/toast";

export default function CodeNameForm({
  cohortId,
  current,
}: {
  cohortId: string;
  current: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateCohortCodeName(cohortId, value);
      if (result.error) {
        setError(result.error);
        toast(result.error, "error");
      } else {
        setEditing(false);
        toast("Code name saved");
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setValue(current ?? ""); setEditing(false); }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. GHACC62"
          className="text-xs border border-slate-300 rounded px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={handleSave}
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
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors group"
      title="Set login code name"
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
          <span>Set code name</span>
        </>
      )}
    </button>
  );
}
