"use client";

import { useState } from "react";
import { useActionState } from "react";
import { submitAccessRequest } from "@/actions/staff";
import Link from "next/link";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed";

const inputErrCls =
  "w-full rounded-lg border border-red-400 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent";

const GHANA_OFFICES = [
  { town: "Takoradi", region: "Western Region"       },
  { town: "Accra",    region: "Greater Accra Region" },
  { town: "Kumasi",   region: "Ashanti Region"       },
] as const;

function isValidPhone(raw: string): boolean {
  const s = raw.replace(/[\s\-().]/g, "");
  if (/^(\+233[2-9]\d{8}|0[2-9]\d{8})$/.test(s)) return true;
  if (/^(\+250[7-9]\d{8}|0[7-9]\d{8})$/.test(s)) return true;
  return false;
}

function RequiredMark() {
  return <span className="text-red-500 ml-0.5" aria-hidden>*</span>;
}

function Field({
  label,
  name,
  required,
  optional,
  error,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <RequiredMark />}
        {optional && (
          <span className="ml-1.5 text-xs font-normal text-slate-400">(optional)</span>
        )}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function RequestForm() {
  const [state, action, isPending] = useActionState(submitAccessRequest, null);

  // Role + trainer location state
  const [selectedRole, setSelectedRole] = useState<"trainer" | "quiz_creator">("quiz_creator");
  const [selectedInstitution, setSelectedInstitution] = useState("");
  const [selectedTown, setSelectedTown] = useState("");

  // Controlled values for all text fields — survive failed submissions
  const [fullName, setFullName]           = useState("");
  const [email, setEmail]                 = useState("");
  const [institutionText, setInstitutionText] = useState(""); // quiz_creator only
  const [townText, setTownText]           = useState("");     // quiz_creator only
  const [regionText, setRegionText]       = useState("");     // quiz_creator only
  const [phone, setPhone]                 = useState("");
  const [reason, setReason]               = useState("");
  const [phoneBlurred, setPhoneBlurred]   = useState(false);

  const isTrainer = selectedRole === "trainer";
  const isRwanda  = selectedInstitution === "AmaliTech - Rwanda";

  const townValue   = isRwanda ? "Kigali" : selectedTown;
  const regionValue = isRwanda
    ? "Kigali"
    : GHANA_OFFICES.find((o) => o.town === selectedTown)?.region ?? "";

  // Phone input: strip anything that isn't +, digit, space, or dash
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d+\s\-]/g, "");
    setPhone(cleaned);
  }

  // Show live error: after field is blurred OR once 10+ chars entered (number is "complete")
  const phoneInvalid     = phone.length > 0 && !isValidPhone(phone);
  const showLivePhoneErr = phoneInvalid && (phoneBlurred || phone.replace(/\s/g, "").length >= 10);
  const phoneError       = showLivePhoneErr
    ? "Enter a valid Ghana (+233) or Rwanda (+250) phone number"
    : state?.errors?.phone?.[0];

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
      <p className="text-xs text-slate-400">
        Fields marked <span className="text-red-500">*</span> are required.
      </p>

      {/* Role selector */}
      <Field label="I am applying as a…" name="requested_role" required error={state?.errors?.requested_role?.[0]}>
        <div className="flex gap-3">
          {(["trainer", "quiz_creator"] as const).map((role) => (
            <label
              key={role}
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
                onChange={() => {
                  setSelectedRole(role);
                  setSelectedInstitution("");
                  setSelectedTown("");
                }}
                className="accent-purple-600"
              />
              <span className="text-sm text-slate-700">
                {role === "quiz_creator" ? "Quiz Creator" : "Trainer"}
              </span>
            </label>
          ))}
        </div>
      </Field>

      {/* Full name */}
      <Field label="Full name" name="full_name" required error={state?.errors?.full_name?.[0]}>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
          className={inputCls}
        />
      </Field>

      {/* Email */}
      <Field label="Email address" name="email" required error={state?.errors?.email?.[0]}>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputCls}
        />
      </Field>

      {/* Institution */}
      <Field
        label="Institution / Organisation"
        name="institution"
        required
        error={state?.errors?.institution?.[0]}
      >
        {isTrainer ? (
          <select
            id="institution"
            name="institution"
            required
            value={selectedInstitution}
            onChange={(e) => {
              setSelectedInstitution(e.target.value);
              setSelectedTown("");
            }}
            className={inputCls}
          >
            <option value="">Select institution…</option>
            <option value="AmaliTech - Ghana">AmaliTech - Ghana</option>
            <option value="AmaliTech - Rwanda">AmaliTech - Rwanda</option>
          </select>
        ) : (
          <input
            id="institution"
            name="institution"
            type="text"
            required
            value={institutionText}
            onChange={(e) => setInstitutionText(e.target.value)}
            placeholder="e.g. University of Ghana"
            className={inputCls}
          />
        )}
      </Field>

      {/* Town + Region */}
      {isTrainer ? (
        <>
          <input type="hidden" name="town"   value={townValue} />
          <input type="hidden" name="region" value={regionValue} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Town / City" name="town_display" required error={state?.errors?.town?.[0]}>
              <select
                id="town_display"
                disabled={isRwanda}
                value={townValue}
                onChange={(e) => setSelectedTown(e.target.value)}
                className={inputCls}
              >
                <option value="">Select office…</option>
                {GHANA_OFFICES.map((o) => (
                  <option key={o.town} value={o.town}>{o.town}</option>
                ))}
                {isRwanda && <option value="Kigali">Kigali</option>}
              </select>
            </Field>
            <Field label="Region" name="region_display" required error={state?.errors?.region?.[0]}>
              <select
                id="region_display"
                disabled={isRwanda}
                value={regionValue}
                onChange={(e) => {
                  const office = GHANA_OFFICES.find((o) => o.region === e.target.value);
                  if (office) setSelectedTown(office.town);
                }}
                className={inputCls}
              >
                <option value="">Select region…</option>
                {GHANA_OFFICES.map((o) => (
                  <option key={o.region} value={o.region}>{o.region}</option>
                ))}
                {isRwanda && <option value="Kigali">Kigali</option>}
              </select>
            </Field>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Town / City" name="town" required error={state?.errors?.town?.[0]}>
            <input
              id="town"
              name="town"
              type="text"
              required
              value={townText}
              onChange={(e) => setTownText(e.target.value)}
              placeholder="e.g. Accra"
              className={inputCls}
            />
          </Field>
          <Field label="Region" name="region" required error={state?.errors?.region?.[0]}>
            <input
              id="region"
              name="region"
              type="text"
              required
              value={regionText}
              onChange={(e) => setRegionText(e.target.value)}
              placeholder="e.g. Greater Accra"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {/* Phone — live validation */}
      <Field label="Phone number" name="phone" required error={phoneError}>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          value={phone}
          onChange={handlePhoneChange}
          onBlur={() => setPhoneBlurred(true)}
          placeholder="+233 or +250 followed by 9 digits"
          className={showLivePhoneErr ? inputErrCls : inputCls}
        />
      </Field>

      {/* Reason (optional) */}
      <Field
        label="Why do you need access?"
        name="reason"
        optional
        error={state?.errors?.reason?.[0]}
      >
        <textarea
          id="reason"
          name="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
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
