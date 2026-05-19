"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeStaffAccount } from "@/actions/staff";

export default function SARemoveStaffPanel({
  targetId,
  fullName,
}: {
  targetId: string;
  fullName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeStaffAccount(targetId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.push("/superadmin/dashboard");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-red-200 p-5">
      <h2 className="text-sm font-semibold text-red-700 mb-1">Remove account</h2>
      <p className="text-xs text-slate-500 mb-4">
        Permanently deletes this account and all associated data. Use this to remove duplicate entries.
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Remove <span className="font-semibold">{fullName}</span> permanently?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRemove}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {isPending ? "Removing…" : "Yes, remove"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 px-4 py-2 rounded-lg transition-colors"
        >
          Remove this account
        </button>
      )}
    </div>
  );
}
