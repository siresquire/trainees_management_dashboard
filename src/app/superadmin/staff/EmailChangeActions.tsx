"use client";

import { useTransition, useState } from "react";
import { approveEmailChange, denyEmailChange } from "@/actions/profile";

export default function EmailChangeActions({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handle(action: "approve" | "deny") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveEmailChange(requestId)
          : await denyEmailChange(requestId);
      if (result.error) setError(result.error);
      else setDone(action === "approve" ? "approved" : "denied");
    });
  }

  if (done === "approved") {
    return (
      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
        Email changed
      </span>
    );
  }
  if (done === "denied") {
    return (
      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
        Denied
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handle("approve")}
        disabled={isPending}
        className="text-xs font-medium bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-3 py-1 rounded-lg transition-colors"
      >
        Approve
      </button>
      <button
        onClick={() => handle("deny")}
        disabled={isPending}
        className="text-xs font-medium border border-slate-300 hover:bg-slate-50 text-slate-600 px-3 py-1 rounded-lg transition-colors"
      >
        Deny
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
