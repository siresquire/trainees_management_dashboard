"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfile, changeMyPassword } from "@/actions/profile";
import { saveExamPassingScore } from "@/actions/admin-settings";
import { toast } from "@/lib/toast";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white";

const LEVELS = ["practitioner", "associate", "professional"] as const;

export default function AdminProfileClient({
  userId,
  fullName,
  email,
  role,
  passingScores,
}: {
  userId:        string;
  fullName:      string;
  email:         string;
  role:          string;
  passingScores: Record<string, number>;
}) {
  const router = useRouter();
  const [profileState, profileAction, profilePending] = useActionState(updateMyProfile, null);
  const [pwState,      pwAction,      pwPending]      = useActionState(changeMyPassword, null);
  const [isPending, startTransition] = useTransition();

  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of LEVELS) init[l] = String(passingScores[l] ?? 700);
    return init;
  });

  if (profileState?.success) toast("Profile updated");
  if (pwState?.success)      toast("Password changed");

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5 capitalize">{role.replace(/_/g, " ")}</p>
      </div>

      {/* ── Edit profile ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Edit profile</h2>
        <form action={profileAction} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
            <input
              name="full_name"
              type="text"
              required
              defaultValue={fullName}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              disabled
              className={`${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`}
            />
            <p className="text-xs text-slate-400 mt-1">Email changes must be requested via the Super Admin.</p>
          </div>
          {profileState?.error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {profileState.error}
            </p>
          )}
          {profileState?.success && (
            <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Profile updated successfully.
            </p>
          )}
          <button
            type="submit"
            disabled={profilePending}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {profilePending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      {/* ── Exam passing score ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Exam Passing Score</h2>
          <p className="text-xs text-slate-500 mt-0.5">Minimum score (out of 1000) required for a trainee to be marked as certified. AWS CCP default is 700.</p>
        </div>
        <div className="space-y-3">
          {LEVELS.map((level) => (
            <div key={level} className="flex items-center gap-4">
              <label className="w-28 text-xs font-medium text-slate-600 capitalize">{level}</label>
              <input
                type="number" min="100" max="1000" step="10"
                value={scoreInputs[level]}
                onChange={(e) => setScoreInputs((p) => ({ ...p, [level]: e.target.value }))}
                className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const n = parseInt(scoreInputs[level], 10);
                  if (isNaN(n) || n < 100 || n > 1000) { toast("Score must be 100–1000", "error"); return; }
                  startTransition(async () => {
                    const res = await saveExamPassingScore(level, n);
                    if (res.error) { toast(res.error, "error"); return; }
                    toast(`Passing score for ${level} set to ${n}`);
                    router.refresh();
                  });
                }}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Change password ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
        <form action={pwAction} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm new password</label>
            <input
              name="confirm_password"
              type="password"
              required
              placeholder="Repeat your new password"
              className={inputCls}
            />
          </div>
          {pwState?.error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {pwState.error}
            </p>
          )}
          {pwState?.success && (
            <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Password changed successfully.
            </p>
          )}
          <button
            type="submit"
            disabled={pwPending}
            className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {pwPending ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
