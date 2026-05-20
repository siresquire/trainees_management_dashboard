import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * React cache() deduplicates identical calls within the same server render tree.
 * When layout.tsx and page.tsx both call getCurrentUser(), only ONE Supabase auth
 * request is made for the full request — the second call is served from memory.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});

export const getUserProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userId)
    .single();
  return data;
});
