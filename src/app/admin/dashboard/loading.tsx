export default function AdminDashboardLoading() {
  return (
    <div className="p-4 md:p-6 animate-pulse space-y-4">
      {/* Toolbar row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-8 w-32 bg-slate-200 rounded-lg" />
        <div className="h-8 w-32 bg-slate-200 rounded-lg" />
        <div className="h-8 w-24 bg-slate-100 rounded-lg" />
        <div className="ml-auto h-8 w-48 bg-slate-100 rounded-lg" />
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex gap-4">
          {[60, 140, 120, 60, 120, 80, 80, 100, 80, 80].map((w, i) => (
            <div key={i} className="h-3.5 bg-slate-200 rounded flex-shrink-0" style={{ width: w }} />
          ))}
        </div>
        {/* Rows */}
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-3.5 w-14 bg-slate-100 rounded flex-shrink-0" />
              <div className="h-4 w-36 bg-slate-200 rounded flex-shrink-0" />
              <div className="h-3.5 w-28 bg-slate-100 rounded flex-shrink-0" />
              <div className="h-5 w-14 bg-slate-100 rounded-full flex-shrink-0" />
              <div className="space-y-1.5 flex-shrink-0">
                <div className="h-2 w-28 bg-slate-100 rounded-full" />
                <div className="h-2 w-24 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 w-8 bg-slate-100 rounded flex-shrink-0" />
              <div className="h-4 w-20 bg-slate-100 rounded flex-shrink-0" />
              <div className="h-6 w-16 bg-slate-100 rounded-lg flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
