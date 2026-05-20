import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import InviteStaffForm from "../staff/InviteStaffForm";
import AccessRequestActions from "../staff/AccessRequestActions";
import EmailChangeActions from "../staff/EmailChangeActions";

export default async function SuperAdminDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { count: trainerCount },
    { count: traineeCount },
    { count: activeCohortCount },
    { data: staff },
    { data: pendingRequests },
    { data: emailChangeRequests },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "trainer").eq("is_active", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "trainee").eq("is_active", true),
    supabase.from("cohorts").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("profiles").select("id, full_name, role").in("role", ["trainer", "quiz_creator", "admin"]).eq("is_active", true).order("full_name"),
    supabase.from("access_requests").select("id, full_name, email, reason, institution, town, region, phone, requested_role, created_at").eq("status", "pending").order("created_at", { ascending: true }),
    // disambiguate FK: table has two refs to profiles (user_id and reviewed_by)
    supabase.from("email_change_requests").select("id, user_id, current_email, requested_email, reason, created_at, profiles!user_id(full_name)").eq("status", "pending").order("created_at", { ascending: true }),
  ]);

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admin</h1>
          <p className="text-slate-500 text-sm mt-0.5">Platform overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/request-access"
            className="text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 bg-white px-4 py-2 rounded-lg transition-colors"
          >
            View request form
          </Link>
          <Link
            href="/superadmin/cohorts/new"
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Cohort
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Active cohorts" value={activeCohortCount ?? 0} />
        <StatCard label="Active trainers" value={trainerCount ?? 0} />
        <StatCard label="Active trainees" value={traineeCount ?? 0} />
      </div>

      {/* Pending access requests */}
      {(pendingRequests?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-semibold text-amber-900">
              Pending access requests
            </h2>
            <span className="ml-auto bg-amber-200 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
              {pendingRequests!.length}
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingRequests!.map((req) => (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900">{req.full_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        req.requested_role === "trainer"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {req.requested_role === "trainer" ? "Trainer" : "Quiz Creator"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{req.email}</p>
                    {req.phone && (
                      <p className="text-xs text-slate-500">{req.phone}</p>
                    )}
                    {(req.institution || req.town || req.region) && (
                      <p className="text-xs text-slate-500">
                        {[req.institution, req.town, req.region].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {req.reason && (
                      <p className="text-xs text-slate-600 mt-1 italic max-w-md">"{req.reason}"</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(req.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>
                  <AccessRequestActions requestId={req.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email change requests */}
      {(emailChangeRequests?.length ?? 0) > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-blue-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-semibold text-blue-900">Pending email-change requests</h2>
            <span className="ml-auto bg-blue-200 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">
              {emailChangeRequests!.length}
            </span>
          </div>
          <div className="divide-y divide-blue-100">
            {emailChangeRequests!.map((req) => {
              const staffName = (req.profiles as { full_name: string } | null)?.full_name ?? "Unknown";
              return (
                <div key={req.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-slate-900">{staffName}</p>
                      <p className="text-xs text-slate-500">
                        <span className="line-through text-slate-400">{req.current_email}</span>
                        {" → "}
                        <span className="font-medium text-slate-700">{req.requested_email}</span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-slate-600 italic max-w-md">"{req.reason}"</p>
                      )}
                      <p className="text-xs text-slate-400">
                        {new Date(req.created_at).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                    <EmailChangeActions requestId={req.id} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Staff section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Active Staff
            {staff?.length ? (
              <span className="ml-2 text-slate-400 font-normal">({staff.length})</span>
            ) : null}
          </h2>
          <InviteStaffForm />
        </div>

        {staff && staff.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-50">
              {staff.map((s) => (
                <Link
                  key={s.id}
                  href={`/superadmin/staff/${s.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors group"
                >
                  <span className="text-sm text-slate-800 group-hover:text-slate-900">{s.full_name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs capitalize px-2 py-0.5 rounded-full font-medium ${
                      s.role === "trainer"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {s.role.replace("_", " ")}
                    </span>
                    <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 py-8 text-center text-sm text-slate-400">
            No active staff yet — send an invitation above.
          </div>
        )}
      </div>

      {/* All cohorts link */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">All cohorts</h2>
          <p className="text-xs text-slate-500 mt-0.5">View and manage every cohort on the platform</p>
        </div>
        <Link
          href="/trainer/dashboard"
          className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
        >
          View all
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
