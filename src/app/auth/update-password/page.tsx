"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";

export default function UpdatePasswordPage() {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const dest =
      profile?.role === "super_admin"    ? "/superadmin/dashboard"
      : profile?.role === "trainer"      ? "/trainer/dashboard"
      : profile?.role === "quiz_creator" ? "/trainer/dashboard"
      : "/trainee/dashboard";

    router.replace(dest);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-10 w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Set new password</h1>
          <p className="text-slate-500 text-sm mt-1">Choose a new password for your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Repeat your password"
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
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            {saving ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
