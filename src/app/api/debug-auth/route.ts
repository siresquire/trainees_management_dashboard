import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const svc = createServiceClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ step: "getUser_failed", userErr });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  // Also try with the service role to confirm the row exists
  const { data: svcProfile, error: svcErr } = await svc
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  const dbUrl = process.env.DATABASE_URL ? "set (starts with: " + process.env.DATABASE_URL.slice(0, 30) + "...)" : "NOT SET";

  return NextResponse.json({
    user_id: user.id,
    user_email: user.email,
    profile,
    profileErr,
    svcProfile,
    svcErr,
    DATABASE_URL: dbUrl,
  });
}
