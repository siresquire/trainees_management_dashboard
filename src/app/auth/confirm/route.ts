import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();
  let sessionError: unknown = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    sessionError = error;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    sessionError = error;
  } else {
    return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
  }

  if (!sessionError) {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = profile?.role;
      const dest =
        next !== "/"
          ? next
          : role === "super_admin"  ? "/superadmin/dashboard"
          : role === "trainer"      ? "/trainer/dashboard"
          : role === "quiz_creator" ? "/trainer/dashboard"
          : role === "trainee"      ? "/trainee/dashboard"
          : "/login";

      return NextResponse.redirect(new URL(dest, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}
