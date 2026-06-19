export default function Loading() {
  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl animate-pulse">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-200 rounded-lg" />
          <div className="h-4 w-80 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-xl" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 space-y-3">
            <div className="h-3 w-28 bg-slate-100 rounded" />
            <div className="h-8 w-16 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Summary table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-4 w-56 bg-slate-200 rounded" />
            <div className="h-3 w-80 bg-slate-100 rounded" />
          </div>
          <div className="h-8 w-32 bg-slate-100 rounded-lg" />
        </div>
        <div className="divide-y divide-slate-50">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="h-3 w-3 bg-slate-100 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded font-mono" />
              <div className="h-3 w-40 bg-slate-100 rounded" />
              <div className="ml-auto h-3 w-12 bg-slate-100 rounded" />
              <div className="h-3 w-10 bg-slate-100 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-4 w-44 bg-slate-200 rounded" />
            <div className="h-3 w-72 bg-slate-100 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-44 bg-slate-100 rounded-lg" />
            <div className="h-8 w-36 bg-slate-100 rounded-lg" />
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-3 w-16 bg-slate-100 rounded font-mono" />
              <div className="h-3 w-36 bg-slate-100 rounded" />
              <div className="h-3 w-40 bg-slate-100 rounded" />
              <div className="ml-auto h-3 w-20 bg-slate-100 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
              <div className="h-5 w-20 bg-green-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
