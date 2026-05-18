"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeTraineeStatus, softDeleteTrainee, restoreTrainee } from "@/actions/trainees";

type TraineeStatus = "active" | "completed" | "dropped" | "suspended" | "disabled";

const STATUS_STYLE: Record<TraineeStatus, string> = {
  active:    "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  dropped:   "bg-red-100 text-red-700",
  suspended: "bg-amber-100 text-amber-700",
  disabled:  "bg-slate-100 text-slate-500",
};

const TRANSITIONS: Record<TraineeStatus, { value: TraineeStatus; label: string }[]> = {
  active:    [
    { value: "suspended", label: "Suspend" },
    { value: "completed", label: "Mark completed" },
    { value: "dropped",   label: "Mark dropped" },
  ],
  suspended: [{ value: "active", label: "Reactivate" }],
  completed: [{ value: "active", label: "Reopen" }],
  dropped:   [{ value: "active", label: "Reinstate" }],
  disabled:  [{ value: "active", label: "Enable account" }],
};

export default function TraineeStatusActions({
  traineeId,
  cohortId,
  status,
  deletedAt,
  isSuperAdmin,
}: {
  traineeId: string;
  cohortId: string;
  status: TraineeStatus;
  deletedAt: string | null;
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  function handleStatus(newStatus: TraineeStatus) {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const res = await changeTraineeStatus(traineeId, cohortId, newStatus);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    setConfirmDelete(false);
    startTransition(async () => {
      const res = await softDeleteTrainee(traineeId, cohortId);
      if (res.error) setError(res.error);
      else router.replace(`/trainer/cohorts/${cohortId}`);
    });
  }

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const res = await restoreTrainee(traineeId, cohortId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const transitions = [
    ...TRANSITIONS[status] ?? [],
    ...(isSuperAdmin && status !== "disabled" ? [{ value: "disabled" as TraineeStatus, label: "Disable account" }] : []),
  ];

  // ── Restored / deleted state ─────────────────────────────────────────────
  if (deletedAt) {
    return (
      <div className="flex flex-col gap-2 items-end">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
          Deleted
        </span>
        <p className="text-xs text-slate-400">
          {new Date(deletedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        {isSuperAdmin && (
          <button
            onClick={handleRestore}
            disabled={isPending}
            className="text-xs text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? "Restoring…" : "Restore account"}
          </button>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      {/* Status dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={isPending}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors hover:opacity-80 ${STATUS_STYLE[status]}`}
        >
          {isPending ? "Saving…" : status}
          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && transitions.length > 0 && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[180px]">
              {transitions.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleStatus(t.value)}
                  className={`w-full text-left text-sm px-3 py-2 hover:bg-slate-50 transition-colors ${
                    t.value === "disabled" ? "text-red-600" : "text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete account */}
      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          Delete account
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <span className="text-xs text-red-700">Confirm delete?</span>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
          >
            {isPending ? "…" : "Yes"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-red-600 hover:text-red-800"
          >
            No
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
