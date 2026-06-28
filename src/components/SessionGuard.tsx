"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { SESS_KEY, markSessionActive } from "@/lib/session";

// OAuth/magic-link callbacks redirect server-side so they can't write sessionStorage.
// If the session was created within this window we treat it as a fresh login.
const FRESH_MS    = 2 * 60 * 1000;  // 2 minutes
const POLL_MS     = 60 * 1000;       // re-check every minute
const THROTTLE_MS = 30 * 1000;       // write sessionStorage at most every 30 s

/**
 * Enforces session expiry for the current authenticated section.
 *
 * - Tab or browser closed → sessionStorage cleared → signs out on next visit.
 * - Laptop closed with tab still open → inactivity timer catches it when the
 *   device wakes and the poll fires.
 *
 * Rendered as a hidden child in each authenticated layout.
 */
export default function SessionGuard({ timeout }: { timeout: number }) {
  useEffect(() => {
    const supabase = createClient();
    let pollId: ReturnType<typeof setInterval>;
    let throttled = false;

    async function check() {
      const raw = sessionStorage.getItem(SESS_KEY);

      if (!raw) {
        // No marker — either the tab/browser was closed, or this is a fresh
        // OAuth / magic-link callback that couldn't write sessionStorage.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.replace("/login"); return; }

        const signedInAt = session.user.last_sign_in_at
          ? new Date(session.user.last_sign_in_at).getTime()
          : 0;

        if (Date.now() - signedInAt < FRESH_MS) {
          // Brand-new session via OAuth callback — write the marker now.
          markSessionActive();
        } else {
          // Old session, no marker → tab or browser was closed. Sign out.
          await supabase.auth.signOut();
          window.location.replace("/login");
        }
        return;
      }

      let stored: { t: number };
      try { stored = JSON.parse(raw) as { t: number }; }
      catch {
        sessionStorage.removeItem(SESS_KEY);
        window.location.replace("/login");
        return;
      }

      if (Date.now() - stored.t > timeout) {
        sessionStorage.removeItem(SESS_KEY);
        await supabase.auth.signOut();
        window.location.replace("/login");
      }
    }

    function onActivity() {
      if (throttled) return;
      throttled = true;
      try { sessionStorage.setItem(SESS_KEY, JSON.stringify({ t: Date.now() })); } catch {}
      setTimeout(() => { throttled = false; }, THROTTLE_MS);
    }

    const EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    check();
    pollId = setInterval(check, POLL_MS);

    return () => {
      clearInterval(pollId);
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [timeout]);

  return null;
}
