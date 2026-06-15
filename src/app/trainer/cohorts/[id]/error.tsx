'use client'

import { useEffect } from 'react'

export default function CohortError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[cohort error boundary]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
      <h2 className="text-xl font-semibold text-slate-800">Something went wrong</h2>
      <p className="text-slate-500 max-w-md">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      {error.digest && (
        <p className="text-xs text-slate-400 font-mono">Error ID: {error.digest}</p>
      )}
      <button
        onClick={() => unstable_retry()}
        className="mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
