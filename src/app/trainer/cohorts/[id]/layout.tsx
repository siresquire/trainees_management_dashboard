import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import StatusMenu from "./StatusMenu";
import ReassignOwnerForm from "./ReassignOwnerForm";
import CodeNameForm from "./CodeNameForm";
import ExamTypeForm from "./ExamTypeForm";
import CohortTabBar from "./CohortTabBar";

const LEVEL_BADGE: Record<string, string> = {
  practitioner: "bg-blue-100 text-blue-700",
  associate: "bg-purple-100 text-purple-700",
  devops: "bg-emerald-100 text-emerald-700",
};

function getTabs(level: string) {
  return [
    { label: "Trainees", href: "" },
    ...(level === "associate"
      ? [{ label: "Whizlabs", href: "/whizlabs" }]
      : level === "practitioner"
      ? [{ label: "Canvas", href: "/canvas" }]
      : []),
    { label: "Tasks",      href: "/tasks"      },
    { label: "Quizzes",    href: "/quizzes"    },
    { label: "Exams",      href: "/exams"      },
    { label: "Attendance", href: "/attendance" },
  ];
}

export default async function CohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";

  // Verify access (super admin bypasses cohort_access check)
  if (!isSuperAdmin) {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", id)
      .eq("trainer_id", user.id)
      .single();
    if (!access) notFound();
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id, name, code_name, level, platform, start_date, training_weeks, exam_prep_weeks, status, exam_type")
    .eq("id", id)
    .single();
  if (!cohort) notFound();

  // Is current user an owner of this cohort?
  const { data: ownerRow } = await supabase
    .from("cohort_access")
    .select("role, profiles(full_name)")
    .eq("cohort_id", id)
    .eq("trainer_id", user.id)
    .single();

  const isOwner = ownerRow?.role === "owner";

  // Assigned owner's name (first non-super-admin owner)
  const { data: ownerAccess } = await supabase
    .from("cohort_access")
    .select("trainer_id")
    .eq("cohort_id", id)
    .eq("role", "owner");

  let assignedOwner: string | null = null;
  if (ownerAccess?.length) {
    const { data: ownerProfs } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", ownerAccess.map((r) => r.trainer_id));
    for (const p of ownerProfs ?? []) {
      if (p.role !== "super_admin") { assignedOwner = p.full_name; break; }
    }
  }

  // SA: fetch active trainers/QC for reassignment
  let activeStaff: { id: string; full_name: string; role: string }[] = [];
  if (isSuperAdmin) {
    const { data: staffRows } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["trainer", "quiz_creator"])
      .eq("is_active", true);
    activeStaff = staffRows ?? [];
  }

  const base = `/trainer/cohorts/${id}`;
  const tabs = getTabs(cohort.level);

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-slate-200 px-4 pt-4 pb-0 md:px-8 md:pt-6">
        <Link
          href={isSuperAdmin ? "/trainer/dashboard" : "/trainer/dashboard"}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3 w-fit"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All cohorts
        </Link>

        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h1 className="text-lg font-bold text-slate-900 md:text-xl">{cohort.name}</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${LEVEL_BADGE[cohort.level] ?? "bg-slate-100 text-slate-600"}`}>
            {cohort.level}
          </span>
          <StatusMenu
            cohortId={id}
            status={cohort.status as "active" | "completed" | "archived" | "deleted"}
            isSuperAdmin={isSuperAdmin}
            isOwner={isOwner}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
          <span className="text-xs text-slate-400">
            {new Date(cohort.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {" · "}{cohort.training_weeks}w + {cohort.exam_prep_weeks}w prep
          </span>
          {/* Code name edit (owner or SA) */}
          {(isOwner || isSuperAdmin) && (
            <CodeNameForm cohortId={id} current={cohort.code_name ?? null} />
          )}
          {/* Exam type edit (owner or SA; only for levels with multiple exam options) */}
          {(isOwner || isSuperAdmin) && (cohort.level === "associate" || cohort.level === "devops") && (
            <ExamTypeForm cohortId={id} level={cohort.level} current={cohort.exam_type ?? null} />
          )}
          {(assignedOwner || isSuperAdmin) && (
            <span className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
              {assignedOwner && (
                <span>· <span className="text-slate-600 font-medium">{assignedOwner}</span></span>
              )}
              {isSuperAdmin && (
                <ReassignOwnerForm cohortId={id} staff={activeStaff} />
              )}
            </span>
          )}
        </div>

        <CohortTabBar
          tabs={tabs.map((t) => ({ label: t.label, href: `${base}${t.href}` }))}
          base={base}
        />
      </div>

      <div className="flex-1 p-4 md:p-8">{children}</div>
    </div>
  );
}

