import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileEditForm from "./ProfileEditForm";
import EmailChangeForm from "./EmailChangeForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Check for existing pending email-change request (not applicable to super_admin)
  const { data: pendingRequest } = profile.role !== "super_admin"
    ? await supabase
        .from("email_change_requests")
        .select("id, requested_email, created_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle()
    : { data: null };

  const ROLE_LABEL: Record<string, string> = {
    trainer:      "Trainer",
    quiz_creator: "Quiz Creator",
    super_admin:  "Super Admin",
  };

  return (
    <div className="max-w-xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account details</p>
      </div>

      {/* Read-only info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Account info</h2>
        <div className="space-y-2">
          <Row label="Email"  value={user.email ?? "—"} />
          <Row label="Role"   value={ROLE_LABEL[profile.role] ?? profile.role} />
          <Row
            label="Status"
            value={profile.is_active ? "Active" : "Deactivated"}
            valueClass={profile.is_active ? "text-green-600" : "text-red-500"}
          />
        </div>
      </div>

      {/* Edit name */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Edit profile</h2>
        <ProfileEditForm fullName={profile.full_name} />
      </div>

      {/* Email change — hidden for Super Admin (security: rerouting SA email = account takeover) */}
      {profile.role !== "super_admin" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Change email address</h2>
          <p className="text-xs text-slate-500 mb-4">
            Email changes require Super Admin approval. Submit a request below and you'll be
            notified once it's reviewed.
          </p>

          {pendingRequest ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">Request pending</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Requested: <span className="font-medium">{pendingRequest.requested_email}</span>
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Submitted{" "}
                {new Date(pendingRequest.created_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })}
                . A Super Admin will review it shortly.
              </p>
            </div>
          ) : (
            <EmailChangeForm currentEmail={user.email ?? ""} />
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass = "text-slate-700",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 w-20 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium flex-1 text-right ${valueClass}`}>{value}</span>
    </div>
  );
}
