"use client";

import { useState } from "react";
import { useActionState } from "react";
import { submitAccessRequest } from "@/actions/staff";
import Link from "next/link";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent";

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function RequestForm() {
  const [state, action, isPending] = useActionState(submitAccessRequest, null);
  const [selectedRole, setSelectedRole] = useState<"trainer" | "quiz_creator">("quiz_creator");

  if (state?.success) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Request submitted</h2>
        <p className="text-sm text-slate-500">
          The platform administrator will review your request and send you an
          invitation link if approved. Check your email inbox.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-orange-600 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {/* Role selector */}
      <Field label="I am applying as a…" name="requested_role" error={state?.errors?.requested_role?.[0]}>
        <div className="flex gap-3">
          {(["trainer", "quiz_creator"] as const).map((role) => (
            <label
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`flex-1 flex items-center gap-2.5 border rounded-lg px-3.5 py-2.5 cursor-pointer transition-colors ${
                selectedRole === role
                  ? "border-purple-500 bg-purple-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="requested_role"
                value={role}
                checked={selectedRole === role}
                onChange={() => setSelectedRole(role)}
                className="accent-purple-600"
              />
              <span className="text-sm text-slate-700">
                {role === "quiz_creator" ? "Quiz Creator" : "Trainer"}
              </span>
            </label>
          ))}
        </div>
      </Field>

      {/* Name */}
      <Field label="Full name" name="full_name" error={state?.errors?.full_name?.[0]}>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          placeholder="Your full name"
          className={inputCls}
        />
      </Field>

      {/* Email */}
      <Field label="Email address" name="email" error={state?.errors?.email?.[0]}>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className={inputCls}
        />
      </Field>

      {/* Institution */}
      <Field label="Institution / Organisation" name="institution" error={state?.errors?.institution?.[0]}>
        <input
          id="institution"
          name="institution"
          type="text"
          required
          placeholder="e.g. Amalitech Ghana"
          className={inputCls}
        />
      </Field>

      {/* Town + Region (side by side) */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Town / City" name="town" error={state?.errors?.town?.[0]}>
          <input
            id="town"
            name="town"
            type="text"
            required
            placeholder="e.g. Accra"
            className={inputCls}
          />
        </Field>
        <Field label="Region" name="region" error={state?.errors?.region?.[0]}>
          <input
            id="region"
            name="region"
            type="text"
            required
            placeholder="e.g. Greater Accra"
            className={inputCls}
          />
        </Field>
      </div>

      {/* Phone */}
      <Field label="Phone number" name="phone" error={state?.errors?.phone?.[0]}>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          placeholder="+233 XX XXX XXXX"
          className={inputCls}
        />
      </Field>

      {/* Reason */}
      <Field label="Why do you need access?" name="reason" error={state?.errors?.reason?.[0]}>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          placeholder="Briefly explain your role and how you plan to use the platform…"
          className={`${inputCls} resize-none`}
        />
      </Field>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
      >
        {isPending ? "Submitting…" : "Submit request"}
      </button>

      <p className="text-center text-xs text-slate-400">
        Already have access?{" "}
        <Link href="/login" className="text-orange-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
