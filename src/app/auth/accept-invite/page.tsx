"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setError(true);
      return;
    }

    const supabase = createClient();

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data: { session }, error: sessionError }) => {
        if (sessionError || !session) { setError(true); return; }

        return supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            const dest =
              profile?.role === "super_admin"    ? "/superadmin/dashboard"
              : profile?.role === "trainer"      ? "/trainer/dashboard"
              : profile?.role === "quiz_creator" ? "/trainer/dashboard"
              : "/trainee/dashboard";
            router.replace(dest);
          });
      })
      .catch(() => setError(true));
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-600 font-medium">Invite link is invalid or has expired.</p>
          <a href="/login" className="text-sm text-orange-600 hover:underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500">Setting up your account…</p>
      </div>
    </div>
  );
}
