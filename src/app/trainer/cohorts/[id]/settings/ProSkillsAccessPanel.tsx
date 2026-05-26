"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignProSkillsInstructor, removeProSkillsInstructor } from "@/actions/pro-skills";

type Instructor = { id: string; full_name: string };

type Props = {
  cohortId:             string;
  instructors:          Instructor[];   // already assigned
  availableInstructors: Instructor[];   // not yet assigned — shown in the dropdown
};

export default function ProSkillsAccessPanel({
  cohortId,
  instructors,
  availableInstructors,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedId, setSelectedId]   = useState("");
  const [addError,   setAddError]     = useState("");
  const [addSuccess, setAddSuccess]   = useState("");
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});

  const refresh = () => router.refresh();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(""); setAddSuccess("");
    if (!selectedId) { setAddError("Please select an instructor."); return; }
    startTransition(async () => {
      const res = await assignProSkillsInstructor(cohortId, selectedId);
      if ("error" in res && res.error) { setAddError(res.error); return; }
      setAddSuccess("Instructor assigned successfully.");
      setSelectedId("");
      refresh();
    });
  }

  function handleRemove(instructorId: string) {
    setRemoveErrors((p) => ({ ...p, [instructorId]: "" }));
    startTransition(async () => {
      const res = await removeProSkillsInstructor(cohortId, instructorId);
      if ("error" in res && res.error) {
        setRemoveErrors((p) => ({ ...p, [instructorId]: res.error! }));
        return;
      }
      refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Professional Skills Instructors</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Assign instructors who can manage pro skills sessions and assignments for this cohort.
        </p>
      </div>

      {/* Currently assigned */}
      {instructors.length > 0 ? (
        <ul className="space-y-2">
          {instructors.map((inst) => (
            <li
              key={inst.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{inst.full_name}</p>
                {removeErrors[inst.id] && (
                  <p className="text-xs text-red-600 mt-0.5">{removeErrors[inst.id]}</p>
                )}
              </div>
              <button
                onClick={() => handleRemove(inst.id)}
                disabled={isPending}
                className="flex-shrink-0 text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">No pro skills instructors assigned yet.</p>
      )}

      {/* Add from dropdown */}
      {availableInstructors.length > 0 ? (
        <form onSubmit={handleAdd} className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">
            Add Pro Skills Instructor
          </label>
          {addError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
              {addError}
            </p>
          )}
          {addSuccess && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
              {addSuccess}
            </p>
          )}
          <div className="flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">Select an instructor…</option>
              {availableInstructors.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.full_name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isPending || !selectedId}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      ) : availableInstructors.length === 0 && instructors.length === 0 ? (
        <p className="text-xs text-slate-400">
          No pro skills instructors have been created yet. Ask a Super Admin to invite one.
        </p>
      ) : (
        <p className="text-xs text-slate-400">All available instructors are already assigned.</p>
      )}
    </div>
  );
}
