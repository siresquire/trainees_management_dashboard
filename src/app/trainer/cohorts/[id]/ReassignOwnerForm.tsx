"use client";

import { useState, useTransition } from "react";
import { reassignCohortOwner } from "@/actions/cohorts";

type Staff = { id: string; full_name: string; role: string };

export default function ReassignOwnerForm({
  cohortId,
  staff,
}: {
  cohortId: string;
  staff: Staff[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const result = await reassignCohortOwner(cohortId, selectedId);
      if (result.error) {
        setError(result.error);
      } else {
        const name = staff.find((s) => s.id === selectedId)?.full_name ?? "new trainer";
        setSuccessMsg(`Assigned to ${name}`);
        setOpen(false);
        setSelectedId("");
      }
    });
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {successMsg && (
          <span className="text-xs text-green-600 font-medium">{successMsg}</span>
        )}
        <button
          onClick={() => { setOpen(true); setError(null); }}
          className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
        >
          Reassign
        </button>
      </span>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="inline-flex items-center gap-2 flex-wrap mt-0">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={isPending}
        className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select trainer…</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name} ({s.role === "quiz_creator" ? "QC" : "Trainer"})
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!selectedId || isPending}
        className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg disabled:opacity-50 hover:bg-blue-700"
      >
        {isPending ? "Saving…" : "Assign"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null); }}
        className="text-xs text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </form>
  );
}
