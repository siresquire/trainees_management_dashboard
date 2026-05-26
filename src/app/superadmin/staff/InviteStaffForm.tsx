"use client";

import { useActionState, useState, useRef } from "react";
import { inviteStaff } from "@/actions/staff";

export default function InviteStaffForm() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, isPending] = useActionState(inviteStaff, null);
  const linkRef = useRef<HTMLInputElement>(null);

  function copyLink() {
    const toCopy = state?.tempPassword ?? state?.inviteLink;
    if (!toCopy) return;
    navigator.clipboard.writeText(toCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleClose() {
    setOpen(false);
    setCopied(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Invite Staff Member
      </button>
    );
  }

  // Existing user — show temp password to share directly (no expiry)
  if (state?.success && state.tempPassword) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Account already exists</h3>
        </div>
        <p className="text-xs text-slate-500 mb-1">
          A temporary password has been set for <span className="font-medium text-slate-700">{state.email}</span>.
          Share it securely (e.g. Slack) and ask them to sign in at the dashboard, then change their password in profile settings.
        </p>
        <p className="text-xs text-slate-400 mb-3">Login URL: <span className="font-mono">/login</span></p>
        <div className="flex gap-2">
          <input
            ref={linkRef}
            readOnly
            value={state.tempPassword}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-800 bg-slate-50 focus:outline-none"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={copyLink}
            className="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-amber-600 mt-2">This password replaces their previous one immediately. No expiry.</p>
        <button
          onClick={handleClose}
          className="mt-4 w-full text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg py-2 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // New user — email sent, show the link as a copy-and-share fallback
  if (state?.success && state.inviteLink) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Invitation sent!</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          An email was sent. If it doesn&apos;t arrive, share this link directly with the invitee:
        </p>
        <div className="flex gap-2">
          <input
            ref={linkRef}
            readOnly
            value={state.inviteLink}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 bg-slate-50 focus:outline-none"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={copyLink}
            className="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-amber-600 mt-2">This link expires in 24 hours and is single-use.</p>
        <button
          onClick={handleClose}
          className="mt-4 w-full text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg py-2 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Error state where we also have a link to share
  if (state?.error && state.inviteLink) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {state.error}
        </p>
        <div className="flex gap-2">
          <input
            ref={linkRef}
            readOnly
            value={state.inviteLink}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 bg-slate-50 focus:outline-none"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={copyLink}
            className="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-amber-600 mt-2">This link expires in 24 hours and is single-use.</p>
        <button
          onClick={handleClose}
          className="mt-4 w-full text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg py-2 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Invite Staff Member</h3>
        <button
          onClick={handleClose}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form action={action} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
          <input
            name="full_name"
            type="text"
            required
            placeholder="e.g. Kwame Asante"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {state?.errors?.full_name && (
            <p className="text-xs text-red-600 mt-0.5">{state.errors.full_name[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Email address</label>
          <input
            name="email"
            type="email"
            required
            placeholder="trainer@amalitech.org"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {state?.errors?.email && (
            <p className="text-xs text-red-600 mt-0.5">{state.errors.email[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
          <select
            name="role"
            defaultValue="trainer"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="trainer">Trainer</option>
            <option value="quiz_creator">Quiz Creator</option>
            <option value="admin">Admin</option>
            <option value="pro_skills_instructor">Pro Skills Instructor</option>
          </select>
        </div>

        {state?.error && !state.inviteLink && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {isPending ? "Sending invite…" : "Send invitation"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
