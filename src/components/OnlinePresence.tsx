"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function OnlinePresence() {
  useEffect(() => {
    const supabase = createClient();

    const ping = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", user.id);
      if (error) console.warn("[OnlinePresence] ping failed:", error.message);
    };

    ping();
    const timer = setInterval(ping, 30_000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
