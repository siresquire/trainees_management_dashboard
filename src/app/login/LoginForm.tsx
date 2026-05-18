"use client";

import { useState } from "react";
import { useActionState } from "react";
import { sendStaffMagicLink, sendTraineeMagicLink } from "./actions";
import Link from "next/link";

type Cohort = { id: string; name: string; code_name: string | null };

// ── Success screen ────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 w-full max-w-md text-center">
      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Check your email</h2>
      <p className="text-slate-500 text-sm">
        We sent a magic link to your email address. Click it to sign in — no password needed.
      </p>
      <p className="text-xs text-slate-400 mt-4">The link expires in 1 hour.</p>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────

export default function LoginForm({ cohorts }: { cohorts: Cohort[] }) {
  const [tab, setTab] = useState<"trainee" | "staff">("trainee");

  const [traineeState, traineeAction, isTraineePending] = useActionState(sendTraineeMagicLink, null);
  const [staffState, staffAction, isStaffPending]       = useActionState(sendStaffMagicLink, null);

  if (traineeState?.success || staffState?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <SuccessScreen />
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-7 text-center">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Amalitech Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-slate-100 p-1 mb-6 gap-1">
          <TabBtn active={tab === "trainee"} onClick={() => setTab("trainee")}>
            Trainee
          </TabBtn>
          <TabBtn active={tab === "staff"} onClick={() => setTab("staff")}>
            Staff
          </TabBtn>
        </div>

        {/* ── Trainee tab ─────────────────────────────────── */}
        {tab === "trainee" && (
          <form action={traineeAction} className="space-y-4">
            <div>
              <label htmlFor="cohort_id" className="block text-sm font-medium text-slate-700 mb-1.5">
                Your cohort
              </label>
              <select
                id="cohort_id"
                name="cohort_id"
                required
                defaultValue=""
                className={inputCls}
              >
                <option value="" disabled>Select your cohort…</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code_name ?? c.name}
                  </option>
                ))}
              </select>
              {cohorts.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No active cohorts at the moment.</p>
              )}
            </div>

            <div>
              <label htmlFor="trainee_email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="trainee_email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="The email your invitation was sent to"
                className={inputCls}
              />
            </div>

            {traineeState?.error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {traineeState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={isTraineePending}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
            >
              {isTraineePending ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        {/* ── Staff tab ───────────────────────────────────── */}
        {tab === "staff" && (
          <form action={staffAction} className="space-y-4">
            <div>
              <label htmlFor="staff_email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="staff_email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@amalitech.org"
                className={inputCls}
              />
            </div>

            {staffState?.error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {staffState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={isStaffPending}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
            >
              {isStaffPending ? "Sending…" : "Send magic link"}
            </button>

            <p className="text-center text-xs text-slate-400 pt-1">
              New staff?{" "}
              <Link href="/request-access" className="text-orange-600 hover:underline">
                Request access
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
