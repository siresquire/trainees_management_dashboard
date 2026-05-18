import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewCohortForm from "./NewCohortForm";

export default async function NewCohortPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (
    <NewCohortForm
      backHref="/trainer/dashboard"
      role={profile?.role ?? "trainer"}
    />
  );
}
