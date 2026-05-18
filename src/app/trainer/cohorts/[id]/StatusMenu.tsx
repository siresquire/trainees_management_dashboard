"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateCohortStatus } from "@/actions/cohorts";
import { toast } from "@/lib/toast";

type Status = "active" | "completed" | "archived" | "deleted";

const STATUS_STYLE: Record<Status, string> = {
  active:    "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived:  "bg-amber-100 text-amber-700",
  deleted:   "bg-red-100 text-red-700",
};

const TRANSITIONS: Record<Status, { value: string; label: string; danger?: boolean }[]> = {
  active:    [{ value: "completed", label: "Mark completed" }, { value: "archived", label: "Archive" }, { value: "deleted", label: "Soft delete", danger: true }],
  completed: [{ value: "active", label: "Reopen" }, { value: "archived", label: "Archive" }, { value: "deleted", label: "Soft delete", danger: true }],
  archived:  [{ value: "active", label: "Unarchive" }, { value: "deleted", label: "Soft delete", danger: true }],
  deleted:   [],
};

const SA_EXTRA: { value: string; label: string; danger: boolean }[] = [
  { value: "hard_delete", label: "Permanently delete", danger: true },
];

export default function StatusMenu({
  cohortId,
  status,
  isSuperAdmin,
  isOwner,
}: {
  cohortId: string;
  status: Status;
  isSuperAdmin: boolean;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [state, action, isPending] = useActionState(updateCohortStatus, null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (state?.success) { setOpen(false); toast("Status updated"); }
    if (state?.error)   { toast(state.error, "error"); }
  }, [state]);

  const canChange = isOwner || isSuperAdmin;
  const transitions = [
    ...TRANSITIONS[status] ?? [],
    ...(isSuperAdmin && status === "deleted" ? SA_EXTRA : []),
    ...(isSuperAdmin && status !== "deleted" ? [SA_EXTRA[0]] : []),
  ];

  if (!canChange) {
    return (
      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[status]}`}>
        {status}
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${STATUS_STYLE[status]} hover:opacity-80`}
      >
        {isPending ? "Saving…" : status}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && transitions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[180px]">
          {state?.error && (
            <p className="text-xs text-red-600 px-3 py-2 border-b border-slate-100">{state.error}</p>
          )}
          {transitions.map((t) => (
            <form key={t.value} action={action}>
              <input type="hidden" name="cohort_id" value={cohortId} />
              <input type="hidden" name="status" value={t.value} />
              <button
                type="submit"
                className={`w-full text-left text-sm px-3 py-2 hover:bg-slate-50 transition-colors ${t.danger ? "text-red-600" : "text-slate-700"}`}
              >
                {t.label}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
