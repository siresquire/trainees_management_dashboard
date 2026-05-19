"use client";

import { useActionState, useEffect } from "react";
import { validateStaff, validateTrainee } from "./actions";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Cohort = { id: string; name: string; code_name: string | null };

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

export default function LoginForm({ cohorts }: { cohorts: Cohort[] }) {
  const [tab, setTab] = useState<"trainee" | "staff">("trainee");

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-10 w-full max-w-md">

        <div className="mb-7 text-center">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Amalitech Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 mb-6 gap-1">
          <TabBtn active={tab === "trainee"} onClick={() => setTab("trainee")}>Trainee</TabBtn>
          <TabBtn active={tab === "staff"}   onClick={() => setTab("staff")}>Staff</TabBtn>
        </div>

        {tab === "trainee" && <TraineeForm cohorts={cohorts} />}
        {tab === "staff"   && <StaffForm />}
      </div>
    </div>
  );
}

// ── Staff form ────────────────────────────────────────────────────────────

function StaffForm() {
  const [staffState, staffAction, isStaffPending] = useActionState(validateStaff, null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!staffState?.dest) return;
    setSigningIn(true);
    setAuthError(null);

    const supabase = createClient();
    supabase.auth.signInWithPassword({ email, password }).then(({ error }) => {
      if (error) {
        setAuthError('Incorrect password. Use "Forgot password?" below to reset it.');
        setSigningIn(false);
      } else {
        window.location.href = staffState.dest!;
      }
    });
  }, [staffState]);

  const pending = isStaffPending || signingIn;
  const error = staffState?.error ?? authError;

  return (
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="staff_password" className="block text-sm font-medium text-slate-700 mb-1.5">
          Password
        </label>
        <input
          id="staff_password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <div className="flex items-center justify-between pt-1">
        <Link href="/forgot-password" className="text-xs text-orange-600 hover:underline">
          Forgot password?
        </Link>
        <Link href="/request-access" className="text-xs text-slate-400 hover:text-slate-600">
          Request access →
        </Link>
      </div>
    </form>
  );
}

// ── Trainee form ──────────────────────────────────────────────────────────

function TraineeForm({ cohorts }: { cohorts: Cohort[] }) {
  const [traineeState, traineeAction, isTraineePending] = useActionState(validateTrainee, null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!traineeState?.dest) return;
    setSigningIn(true);
    setAuthError(null);

    const supabase = createClient();
    supabase.auth.signInWithPassword({ email, password }).then(({ error }) => {
      if (error) {
        setAuthError('Incorrect password. Use "Forgot password?" below to reset it.');
        setSigningIn(false);
      } else {
        window.location.href = traineeState.dest!;
      }
    });
  }, [traineeState]);

  const pending = isTraineePending || signingIn;
  const error = traineeState?.error ?? authError;

  return (
    <form action={traineeAction} className="space-y-4">
      <div>
        <label htmlFor="cohort_id" className="block text-sm font-medium text-slate-700 mb-1.5">
          Your cohort
        </label>
        <select id="cohort_id" name="cohort_id" required defaultValue="" className={inputCls}>
          <option value="" disabled>Select your cohort…</option>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>{c.code_name ?? c.name}</option>
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="trainee_password" className="block text-sm font-medium text-slate-700 mb-1.5">
          Password
        </label>
        <input
          id="trainee_password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-slate-400 pt-1">
        <Link href="/forgot-password" className="text-orange-600 hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
