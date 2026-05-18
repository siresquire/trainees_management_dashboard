"use client";

import { useActionState, useState } from "react";
import { testCanvasToken, saveCanvasToken } from "@/actions/canvas";

export default function TokenForm({
  cohortId,
  hasToken,
}: {
  cohortId: string;
  hasToken: boolean;
}) {
  const [testState, testAction, testPending] = useActionState(testCanvasToken, null);
  const [saveState, saveAction, savePending] = useActionState(saveCanvasToken, null);
  const [showInput, setShowInput] = useState(!hasToken);

  return (
    <div className="space-y-4">
      {hasToken && !showInput ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Token saved
          </div>
          <button
            onClick={() => setShowInput(true)}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Replace token
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              form="token-save-form"
              name="token"
              type="password"
              placeholder="Paste Canvas API token…"
              autoComplete="off"
              className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Test */}
          <form action={testAction} className="inline">
            <input type="hidden" name="cohort_id" value={cohortId} />
            <input type="hidden" name="token" id="token-preview" />
            <button
              type="submit"
              disabled={testPending}
              onClick={(e) => {
                const tokenInput = document.querySelector<HTMLInputElement>('input[name="token"]');
                const hidden = document.getElementById("token-preview") as HTMLInputElement;
                if (hidden && tokenInput) hidden.value = tokenInput.value;
              }}
              className="text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
            >
              {testPending ? "Testing…" : "Test connection"}
            </button>
          </form>

          {testState && "courseName" in testState && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Connected: <strong>{testState.courseName}</strong> · {testState.students} student{testState.students !== 1 ? "s" : ""}
            </p>
          )}
          {testState && "error" in testState && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {testState.error}
            </p>
          )}

          {/* Save */}
          <form id="token-save-form" action={saveAction} className="inline ml-2">
            <input type="hidden" name="cohort_id" value={cohortId} />
            <button
              type="submit"
              disabled={savePending}
              className="text-sm bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              {savePending ? "Saving…" : "Save token"}
            </button>
          </form>

          {saveState && "success" in saveState && (
            <p className="text-sm text-green-700">Token saved successfully.</p>
          )}
          {saveState && "error" in saveState && (
            <p className="text-sm text-red-600">{saveState.error}</p>
          )}

          {hasToken && (
            <button
              onClick={() => setShowInput(false)}
              className="text-xs text-slate-400 hover:text-slate-600 ml-2"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
