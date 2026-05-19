import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import SAStaffEditForm from "./SAStaffEditForm";
import SAEmailForm from "./SAEmailForm";
import SAStaffTempPasswordPanel from "./SAStaffTempPasswordPanel";
import SARemoveStaffPanel from "./SARemoveStaffPanel";

export default async function SAStaffEditPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;
  const supabase = await createClient();
  const svc      = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (myProfile?.role !== "super_admin") redirect("/login");

  // Fetch target staff profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", staffId)
    .in("role", ["trainer", "quiz_creator"])
    .single();
  if (!profile) notFound();

  // Fetch their auth email via admin API
  const { data: { user: authUser } } = await svc.auth.admin.getUserById(staffId);

  // Cohorts this staff member is assigned to
  const { data: assignments } = await supabase
    .from("cohort_access")
    .select("role, cohorts(id, name, status)")
    .eq("trainer_id", staffId);

  return (
    <div className="max-w-xl space-y-6 p-4 md:p-8">
      <Link
        href="/superadmin/dashboard"
        className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 w-fit"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900">{profile.full_name}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{authUser?.email}</p>
      </div>

      {/* Edit name / role / status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Edit profile</h2>
        <SAStaffEditForm
          targetId={profile.id}
          fullName={profile.full_name}
          role={profile.role as "trainer" | "quiz_creator"}
          isActive={profile.is_active}
        />
      </div>

      {/* Change email */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Change email</h2>
        <p className="text-xs text-slate-500 mb-4">
          Current: <span className="font-medium text-slate-700">{authUser?.email}</span>
        </p>
        <SAEmailForm targetId={profile.id} />
      </div>

      {/* Temporary password */}
      <SAStaffTempPasswordPanel targetId={profile.id} />

      {/* Cohort assignments */}
      {(assignments?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Cohort assignments</h2>
          <div className="space-y-1.5">
            {assignments!.map((a, i) => {
              const cohort = a.cohorts as { id: string; name: string; status: string } | null;
              if (!cohort) return null;
              return (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <Link
                    href={`/trainer/cohorts/${cohort.id}`}
                    className="text-slate-700 hover:text-orange-600"
                  >
                    {cohort.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.role === "owner"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {a.role}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      cohort.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {cohort.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Remove account (for duplicate cleanup) */}
      <SARemoveStaffPanel targetId={profile.id} fullName={profile.full_name} />
    </div>
  );
}
