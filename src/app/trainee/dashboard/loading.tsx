export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 md:p-8 max-w-4xl animate-pulse">
      {/* Header */}
      <div>
        <div className="h-7 w-40 bg-slate-200 rounded-lg mb-2" />
        <div className="h-4 w-64 bg-slate-100 rounded" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="h-3 w-16 bg-slate-100 rounded mb-2" />
            <div className="h-7 w-12 bg-slate-200 rounded mb-1" />
            <div className="h-3 w-10 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Weekly tasks card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-slate-100">
          <div className="h-4 w-24 bg-slate-200 rounded mb-3" />
          <div className="flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-7 w-16 bg-slate-100 rounded-lg flex-shrink-0" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 md:px-6 py-3 flex items-center justify-between">
              <div className="h-4 bg-slate-100 rounded w-1/2" />
              <div className="h-5 w-14 bg-slate-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100">
          <div className="h-4 w-36 bg-slate-200 rounded" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4 border-b border-slate-50">
            <div className="h-4 w-5 bg-slate-100 rounded" />
            <div className="h-4 w-32 bg-slate-100 rounded flex-1" />
            <div className="h-4 w-10 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
