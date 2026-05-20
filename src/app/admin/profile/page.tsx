import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminProfileClient from "./AdminProfileClient";

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) redirect("/login");

  return (
    <AdminProfileClient
      userId={user.id}
      fullName={profile.full_name}
      email={user.email ?? ""}
      role={profile.role}
    />
  );
}
