import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });

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
  }

  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}
