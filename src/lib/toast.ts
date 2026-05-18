/**
 * Module-level toast singleton.
 *
 * Any client component can call `toast(message)` or `toast(message, "error")`.
 * The <Toaster /> component (mounted once in AppShell) subscribes on mount and
 * renders the notification bubbles.
 */

export type ToastType = "success" | "error" | "info";

type ToastHandler = (message: string, type: ToastType) => void;

let _handler: ToastHandler | null = null;

/** Fire a toast notification from any client component. */
export function toast(message: string, type: ToastType = "success") {
  _handler?.(message, type);
}

/** Internal — called by <Toaster /> on mount/unmount only. */
export function _setToastHandler(fn: ToastHandler | null) {
  _handler = fn;
}
