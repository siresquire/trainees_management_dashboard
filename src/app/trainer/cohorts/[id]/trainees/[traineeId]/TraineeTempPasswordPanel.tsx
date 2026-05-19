"use client";

import { useState, useTransition } from "react";
import { setTraineeTempPassword } from "@/actions/trainees";

export default function TraineeTempPasswordPanel({
  traineeId,
  cohortId,
  hasAccount,
}: {
  traineeId: string;
  cohortId: string;
  hasAccount: boolean;
}) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    setTempPassword(null);
    startTransition(async () => {
      const result = await setTraineeTempPassword(traineeId, cohortId);
      if (result.error) setError(result.error);
      else setTempPassword(result.tempPassword ?? null);
    });
  }

  function copyPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!hasAccount) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Temporary password</h2>
        <p className="text-xs text-slate-500">
          This trainee hasn&apos;t created an account yet. Use <strong>Invite Trainee</strong> to send them an invitation first.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Temporary password</h2>
      <p className="text-xs text-slate-500 mb-4">
        Generate a one-time password for this trainee. They can change it from their profile after signing in.
      </p>

      {tempPassword ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={tempPassword}
              className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-800 bg-slate-50 focus:outline-none"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={copyPassword}
              className="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-amber-600">Share this securely. It replaces any previous password immediately.</p>
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Generate a new one
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {isPending ? "Generating…" : "Generate temp password"}
          </button>
        </div>
      )}
    </div>
  );
}
