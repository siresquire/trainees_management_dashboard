import { createServiceClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Use service client — this page is for unauthenticated users.
  // The regular anon client returns 0 cohorts because RLS requires auth.
  const supabase = createServiceClient();

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, code_name")
    .eq("status", "active")
    .order("code_name", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return <LoginForm cohorts={cohorts ?? []} />;
}
