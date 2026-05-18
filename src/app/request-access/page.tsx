import Link from "next/link";
import RequestForm from "./RequestForm";

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Nav */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-semibold text-slate-900 text-sm">
              Amalitech AWS re/Start Tracker
            </span>
          </Link>
          <Link href="/login" className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Sign in →
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-10 w-full max-w-md">
          <div className="mb-6">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Request access</h1>
            <p className="text-sm text-slate-500 mt-1">
              Apply for Trainer or Quiz Creator access. The platform administrator
              will review your request and send an invitation if approved.
            </p>
          </div>

          <RequestForm />
        </div>
      </div>
    </div>
  );
}
