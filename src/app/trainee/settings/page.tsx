import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileEditForm from "@/app/trainer/profile/ProfileEditForm";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function TraineeSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="p-4 md:p-8 max-w-md space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Your name</h2>
        <p className="text-xs text-slate-500 mb-4">
          This is the name shown to your trainer on the cohort roster.
        </p>
        <ProfileEditForm fullName={profile?.full_name ?? ""} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Change Password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
