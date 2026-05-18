"use client";

import { useActionState } from "react";
import { createQuestionBank } from "@/actions/question-banks";
import Link from "next/link";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

export default function NewBankForm() {
  const [state, action, isPending] = useActionState(createQuestionBank, null);

  return (
    <form action={action} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Bank name *</label>
        <input
          name="name"
          type="text"
          required
          placeholder="e.g. AWS SAA Practice Questions"
          className={inputCls}
          autoFocus
        />
        {state?.errors?.name?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.name[0]}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
        <textarea
          name="description"
          rows={3}
          placeholder="Brief description of what this bank covers…"
          className={inputCls}
        />
      </div>

      {/* Level */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Level</label>
        <select name="level" className={inputCls} defaultValue="">
          <option value="">— Any level —</option>
          <option value="practitioner">Practitioner</option>
          <option value="associate">Associate</option>
          <option value="devops">DevOps</option>
        </select>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Tags</label>
        <input
          name="tags"
          type="text"
          placeholder="e.g. EC2, S3, IAM (comma-separated)"
          className={inputCls}
        />
        <p className="text-xs text-slate-400 mt-1">Comma-separated keywords</p>
      </div>

      {/* Public */}
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          name="is_public"
          value="1"
          className="mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
        />
        <div>
          <p className="text-sm font-medium text-slate-700">Make public</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Public banks are visible (read-only) to all trainers and quiz creators on the platform.
          </p>
        </div>
      </label>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/trainer/question-banks"
          className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Creating…" : "Create bank"}
        </button>
      </div>
    </form>
  );
}
