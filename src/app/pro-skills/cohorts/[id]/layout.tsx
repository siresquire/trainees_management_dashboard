import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProSkillsTabBar from "./ProSkillsTabBar";

export default async function ProSkillsCohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin      = profile?.role === "admin" || isSuperAdmin;

  if (!isAdmin) {
    // Verify cohort access (pro_skills or trainer owner)
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", id)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) notFound();
  }

  const svc = createServiceClient();
  const { data: cohort } = await svc
    .from("cohorts")
    .select("id, name, code_name, level, start_date, end_date, training_weeks, status")
    .eq("id", id)
    .single();

  if (!cohort) notFound();

  const base = `/pro-skills/cohorts/${id}`;
  const tabs = [
    { label: "Trainees",    href: base },
    { label: "Sessions",    href: `${base}/sessions` },
    { label: "Assignments", href: `${base}/assignments` },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-slate-200 px-4 pt-4 pb-0 md:px-8 md:pt-6">
        <Link
          href="/pro-skills/dashboard"
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3 w-fit"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All cohorts
        </Link>

        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h1 className="text-lg font-bold text-slate-900 md:text-xl">{cohort.name}</h1>
          {cohort.code_name && cohort.code_name !== cohort.name && (
            <span className="text-xs font-mono text-slate-400">{cohort.code_name}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
          <span className="text-xs text-slate-400">
            {new Date(cohort.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {cohort.end_date && (
              <> – {new Date(cohort.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
            )}
            {" · "}{cohort.training_weeks}w
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
            cohort.status === "active" ? "bg-green-100 text-green-700" :
            cohort.status === "completed" ? "bg-blue-100 text-blue-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            {cohort.status}
          </span>
        </div>

        <ProSkillsTabBar tabs={tabs} base={base} />
      </div>

      <div className="flex-1 p-4 md:p-8">{children}</div>
    </div>
  );
}
