import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LandingPage() {
  // Logged-in users skip the landing page and go straight to their dashboard
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    if (role === "super_admin")  redirect("/superadmin/dashboard");
    if (role === "trainer")      redirect("/trainer/dashboard");
    if (role === "quiz_creator") redirect("/trainer/dashboard");
    if (role === "trainee")      redirect("/trainee/dashboard");
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-semibold text-slate-900 text-sm">
              Amalitech AWS re/Start Tracker
            </span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-medium px-3 py-1 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
          Amalitech Ghana · AWS Cloud Engineering Programme
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
          Your AWS re/Start progress,
          <br className="hidden md:block" /> all in one place
        </h1>
        <p className="text-slate-500 text-base md:text-lg max-w-xl mx-auto mb-8">
          Track weekly KCs, lab completions, cohort rankings, and graduation
          status — in real time, without the spreadsheet.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-3 rounded-xl text-sm transition-colors shadow-sm"
        >
          Sign in to your dashboard
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* User type cards */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-20">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center mb-6">
          Who uses this platform
        </h2>
        <div className="grid md:grid-cols-3 gap-4">

          {/* Trainee */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Trainee</h3>
            <p className="text-sm text-slate-500 mb-4">
              See your weekly KC scores, lab completions, cohort rank, and
              graduation status — without asking your trainer.
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-blue-700 font-medium">How to get access</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Your trainer will send a sign-in link to your personal email
                when your cohort starts.
              </p>
            </div>
          </div>

          {/* Trainer */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Trainer</h3>
            <p className="text-sm text-slate-500 mb-4">
              Manage cohorts, sync Canvas grades, track trainee progress, and
              oversee graduation across all your classes.
            </p>
            <Link
              href="/request-access"
              className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Request access
            </Link>
          </div>

          {/* Quiz Creator */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Quiz Creator</h3>
            <p className="text-sm text-slate-500 mb-4">
              Contribute to cohort curriculum, manage knowledge check
              templates, and co-own cohorts alongside trainers.
            </p>
            <Link
              href="/request-access"
              className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Request access
            </Link>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Amalitech Ghana</p>
          <Link href="/login" className="text-xs text-slate-400 hover:text-orange-600">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
