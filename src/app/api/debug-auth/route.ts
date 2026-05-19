import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ step: "getUser_failed", userErr });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    user_id: user.id,
    user_email: user.email,
    profile,
    profileErr,
  });
}
