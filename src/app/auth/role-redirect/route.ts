import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const dest =
    profile?.role === "super_admin"    ? "/superadmin/dashboard"
    : profile?.role === "trainer"      ? "/trainer/dashboard"
    : profile?.role === "quiz_creator" ? "/trainer/dashboard"
    : "/trainee/dashboard";

  return NextResponse.redirect(new URL(dest, origin));
}
