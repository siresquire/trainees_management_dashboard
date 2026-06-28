/** sessionStorage key used by SessionGuard and markSessionActive. */
export const SESS_KEY = "_amali_sess";

/**
 * Write (or refresh) the session activity marker in sessionStorage.
 * Call this immediately before navigating away from the login page.
 * sessionStorage is cleared automatically when the tab or browser is closed,
 * so the absence of this marker on the next visit triggers a sign-out.
 */
export function markSessionActive(): void {
  try {
    sessionStorage.setItem(SESS_KEY, JSON.stringify({ t: Date.now() }));
  } catch {
    // sessionStorage may be blocked in some private-browsing configurations
  }
}
