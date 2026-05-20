"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Handles implicit-flow magic links: /auth/magic#access_token=...&refresh_token=...
// Called when the trainer uses "Visit account" to open a trainee's session in a new tab.
export default function MagicAuthPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) {
      router.replace("/login?error=auth_failed");
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const access_token  = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      router.replace("/login?error=auth_failed");
      return;
    }

    // Clear the hash before navigating away
    window.history.replaceState(null, "", window.location.pathname);

    fetch("/api/auth/magic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    }).then((res) => {
      router.replace(res.ok ? "/trainee/dashboard" : "/login?error=auth_failed");
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Signing you in…</p>
      </div>
    </div>
  );
}
