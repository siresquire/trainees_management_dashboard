"use client";

import { useActionState, useState, useTransition } from "react";
import { updateMyProfile, changeMyPassword } from "@/actions/profile";
import { toast } from "@/lib/toast";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white";

export default function AdminProfileClient({
  userId,
  fullName,
  email,
  role,
}: {
  userId:   string;
  fullName: string;
  email:    string;
  role:     string;
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateMyProfile, null);
  const [pwState,      pwAction,      pwPending]      = useActionState(changeMyPassword, null);

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
