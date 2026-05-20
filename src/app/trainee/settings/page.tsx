"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { markTempPasswordChanged } from "@/actions/trainees";

export default function TraineeSettingsPage() {
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [msg,      setMsg]      = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (next.length < 8) {
      setMsg({ text: "New password must be at least 8 characters.", ok: false });
      return;
    }
    if (next !== confirm) {
      setMsg({ text: "Passwords do not match.", ok: false });
      return;
    }

    startTransition(async () => {
      const supabase = createClient();

      // Re-authenticate with current password first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setMsg({ text: "Session expired. Please log in again.", ok: false }); return; }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInErr) { setMsg({ text: "Current password is incorrect.", ok: false }); return; }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) { setMsg({ text: updateErr.message, ok: false }); return; }

      // Mark temp password as changed in the trainees table
      await markTempPasswordChanged();

      setMsg({ text: "Password updated successfully.", ok: true });
      setCurrent(""); setNext(""); setConfirm("");
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-md">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Settings</h1>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Change Password</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Current password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {msg && (
            <p className={`text-xs font-medium ${msg.ok ? "text-green-600" : "text-red-600"}`}>
              {msg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {isPending ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
