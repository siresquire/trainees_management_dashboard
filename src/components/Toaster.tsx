"use client";

import { useState, useEffect, useCallback } from "react";
import { _setToastHandler, ToastType } from "@/lib/toast";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
};

let _counter = 0;

const TYPE_STYLES: Record<ToastType, string> = {
  success: "bg-white border-green-300  text-slate-800",
  error:   "bg-white border-red-300    text-slate-800",
  info:    "bg-white border-blue-300   text-slate-800",
};

const ICON_STYLES: Record<ToastType, string> = {
  success: "text-green-500",
  error:   "text-red-500",
  info:    "text-blue-500",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 280);
  }, []);

  useEffect(() => {
    _setToastHandler((message, type) => {
      const id = ++_counter;
      setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
      setTimeout(() => dismiss(id), 4000);
    });
    return () => _setToastHandler(null);
  }, [dismiss]);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          role="status"
          className={[
            "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border",
            "min-w-[260px] max-w-[380px] cursor-pointer select-none",
            TYPE_STYLES[t.type],
            t.exiting ? "animate-toast-out" : "animate-toast-in",
          ].join(" ")}
        >
          {/* Icon */}
          <span className={`mt-0.5 flex-shrink-0 ${ICON_STYLES[t.type]}`}>
            {t.type === "success" && (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
            {t.type === "error" && (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            {t.type === "info" && (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            )}
          </span>

          {/* Message */}
          <p className="text-sm font-medium flex-1 leading-snug">{t.message}</p>

          {/* Dismiss × */}
          <button
            aria-label="Dismiss"
            className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
