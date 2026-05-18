import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const role = profile?.role;
        const dest =
          role === "super_admin" ? "/superadmin/dashboard"
          : role === "trainer"    ? "/trainer/dashboard"
          : role === "trainee"    ? "/trainee/dashboard"
          : role === "quiz_creator" ? "/quizdesk/dashboard"
          : role === "quiz_taker"   ? "/quizdesk/take"
          : "/login";

        return NextResponse.redirect(new URL(dest, origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}
